import { PGlite } from '@electric-sql/pglite'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { STALE_RUNNING_JOB_MS } from '@/render/job-state'
import { getPreviews } from '@/render/store'
import type { RenderInput, RenderResult, SandboxRunner } from '@/render/types'
import { runNetworkPreview } from '@/review/decide'
import type { RenderJobReport } from '@/submit/render-completed-event'
import { submitConfig } from '@/submit/submit'
import {
  drainRenderJobs,
  MAX_RENDER_ATTEMPTS,
  processNextRenderJob,
  requeueStaleJobs,
} from '@/submit/worker'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  // Seed the author referenced by the configs FK (author_id → user.id)
  await db
    .insert(schema.user)
    .values({
      id: 'u1',
      name: 'Author One',
      email: 'author1@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})
// Each test submits as the shared author 'u1'; clear configs between tests so the per-author
// rate limit doesn't accumulate across them (cascades to versions, render jobs, votes, copies).
beforeEach(async () => {
  await db.delete(schema.configs)
})

async function jobRow(versionId: string) {
  const [job] = await db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.configVersionId, versionId))
  return job
}

async function jobStatus(versionId: string): Promise<string | undefined> {
  return (await jobRow(versionId))?.status
}

/** Older than the time limit: the machine that claimed the job was cut off. */
function staleStart(): Date {
  return new Date(Date.now() - STALE_RUNNING_JOB_MS - 1000)
}

describe('requeueStaleJobs', () => {
  async function submitRunning(
    title: string,
    startedAt: Date | null,
    networkHosts: string[] = [],
  ): Promise<string> {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title,
      description: '',
      interpreter: 'bash',
      source: `#!/bin/bash\necho ${title}`,
      networkHosts,
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'running', startedAt })
      .where(eq(schema.renderJobs.configVersionId, versionId))
    return versionId
  }

  it('re-queues an offline job running longer than the time limit', async () => {
    const versionId = await submitRunning('Stale', staleStart())
    expect(await requeueStaleJobs(db)).toBe(1)
    expect(await jobStatus(versionId)).toBe('queued')
  })

  it('leaves a job running for less than the time limit alone', async () => {
    const versionId = await submitRunning('Rendering', new Date(Date.now() - 60_000))
    expect(await requeueStaleJobs(db)).toBe(0)
    expect(await jobStatus(versionId)).toBe('running')
  })

  it('re-queues a running job with no start time, left by the old worker', async () => {
    const versionId = await submitRunning('Orphan', null)
    expect(await requeueStaleJobs(db)).toBe(1)
    expect(await jobStatus(versionId)).toBe('queued')
  })

  it('sends a stale NETWORK job back to held, never queued', async () => {
    const versionId = await submitRunning('Net stale', staleStart(), ['wttr.in'])
    expect(await requeueStaleJobs(db)).toBe(1)
    expect(await jobStatus(versionId)).toBe('held')
  })

  it('fails a stale job that has used up its attempts instead of re-queueing it', async () => {
    const offline = await submitRunning('Crashes offline', staleStart())
    const network = await submitRunning('Crashes online', staleStart(), ['wttr.in'])
    await db
      .update(schema.renderJobs)
      .set({ attempts: MAX_RENDER_ATTEMPTS })
      .where(eq(schema.renderJobs.status, 'running'))

    expect(await requeueStaleJobs(db)).toBe(2)

    for (const versionId of [offline, network]) {
      const job = await jobRow(versionId)
      expect(job?.status).toBe('failed')
      expect(job?.error).toContain(`${MAX_RENDER_ATTEMPTS} times`)
      expect(job?.finishedAt).not.toBeNull()
    }
  })

  it('re-queues a stale job that still has attempts left', async () => {
    const versionId = await submitRunning('One more try', staleStart())
    await db
      .update(schema.renderJobs)
      .set({ attempts: MAX_RENDER_ATTEMPTS - 1 })
      .where(eq(schema.renderJobs.configVersionId, versionId))

    await requeueStaleJobs(db)

    expect(await jobStatus(versionId)).toBe('queued')
  })

  it.each([
    'approved',
    'rejected',
    'superseded',
  ] as const)('fails a stale job whose submission is %s instead of rendering it again', async (decided) => {
    const offline = await submitRunning(`Decided offline ${decided}`, staleStart())
    const network = await submitRunning(`Decided online ${decided}`, staleStart(), ['wttr.in'])
    await db
      .update(schema.submissions)
      .set({ status: decided })
      .where(inArray(schema.submissions.id, [offline, network]))

    expect(await requeueStaleJobs(db)).toBe(2)

    expect(await jobStatus(offline)).toBe('failed')
    expect(await jobStatus(network)).toBe('failed')
  })

  it('leaves done jobs untouched', async () => {
    const versionId = await submitRunning('Done', staleStart())
    await db
      .update(schema.renderJobs)
      .set({ status: 'done' })
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(await requeueStaleJobs(db)).toBe(0)
    expect(await jobStatus(versionId)).toBe('done')
  })
})

describe('processNextRenderJob', () => {
  it('renders a queued job and stores previews, marking the job done', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'T',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho hi',
    })
    const verRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    const ver = verRows[0]
    if (!ver) throw new Error('version row not found')
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: '\x1b[35mOpus\x1b[0m' } })
    const processed = await processNextRenderJob(db, runner)
    expect(processed).not.toBeNull()
    const jobRows = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    const job = jobRows[0]
    if (!job) throw new Error('render job row not found')
    expect(job.status).toBe('done')
    expect(job.finishedAt).not.toBeNull()
    expect(await getPreviews(db, ver.contentSha256)).toHaveLength(8)
  })
  it("keeps the job it is rendering, so another machine's drain doesn't re-queue it", async () => {
    await submitConfig(db, {
      authorId: 'u1',
      title: 'Claimed',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho claimed',
    })
    const fake = new FakeSandboxRunner()
    const requeuedMidRender: number[] = []
    const runner: SandboxRunner = {
      async render(input) {
        requeuedMidRender.push(await requeueStaleJobs(db))
        return fake.render(input)
      },
    }
    await processNextRenderJob(db, runner)
    expect(requeuedMidRender).toHaveLength(8)
    expect(requeuedMidRender.filter((count) => count > 0)).toEqual([])
  })
  it.each([
    ['finishes', () => new FakeSandboxRunner().render],
    ['fails', () => () => Promise.reject(new Error('sandbox down'))],
  ] as const)('leaves a job another machine re-claimed alone when the first run %s', async (_outcome, makeRender) => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Slow but live',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho slow',
    })
    const finish = makeRender()
    const reclaimedAt = new Date(Date.now() + 60_000)
    const runner: SandboxRunner = {
      async render(input) {
        // Another machine re-queued this job as cut off, then claimed it again.
        await db
          .update(schema.renderJobs)
          .set({ status: 'running', startedAt: reclaimedAt })
          .where(eq(schema.renderJobs.configVersionId, versionId))
        return finish(input)
      },
    }

    await processNextRenderJob(db, runner)

    const job = await jobRow(versionId)
    expect(job).toMatchObject({ status: 'running', startedAt: reclaimedAt, error: null })
    expect(job?.finishedAt).toBeNull()
  })

  it('renders a script that prints a NUL byte, which Postgres cannot store', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Nul',
      description: '',
      interpreter: 'bash',
      source: "#!/bin/bash\nprintf 'shown\\0'",
    })

    await processNextRenderJob(
      db,
      new FakeSandboxRunner({ 'clean-main': { stdout: 'shown\u0000' } }),
    )

    expect(await jobStatus(versionId)).toBe('done')
    const [ver] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    const previews = await getPreviews(db, ver?.contentSha256 ?? '')
    expect(previews.find((p) => p.scenarioKey === 'clean-main')?.rawStdout).toBe('shown')
  })

  it('records a failed database write without the script output it carried', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Leaky',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho leaky',
    })
    const runner = new FakeSandboxRunner({
      'clean-main': { trace: { networkAttempts: ['SCRIPT-SECRET\u0000'] } },
    })

    await processNextRenderJob(db, runner)

    const job = await jobRow(versionId)
    expect(job?.status).toBe('failed')
    expect(job?.error).not.toContain('SCRIPT-SECRET')
  })

  it('returns null when there are no queued jobs', async () => {
    while (await processNextRenderJob(db, new FakeSandboxRunner())) {
      /* drain */
    }
    expect(await processNextRenderJob(db, new FakeSandboxRunner())).toBeNull()
  })
  it('marks the job failed if rendering throws', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Boom',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    const runner = { render: () => Promise.reject(new Error('sandbox down')) }
    await processNextRenderJob(db, runner)
    const failedJobRows = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    const failedJob = failedJobRows[0]
    if (!failedJob) throw new Error('render job row not found')
    expect(failedJob.status).toBe('failed')
    expect(failedJob.error).toContain('sandbox down')
  })

  it('reports a finished job with its ids, slug, duration and per-scenario exit status', async () => {
    const { configId, versionId, slug } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Reported',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho hi',
    })
    const reports: RenderJobReport[] = []
    const runner = new FakeSandboxRunner({ 'clean-main': { exitCode: 2, stdout: 'out' } })
    await processNextRenderJob(db, runner, { onJobFinished: (r) => reports.push(r) })
    expect(reports).toHaveLength(1)
    const [report] = reports
    expect(report).toMatchObject({ configId, versionId, slug })
    expect(report?.durationMs).toBeGreaterThanOrEqual(0)
    expect(report?.scenarios).toHaveLength(8)
    expect(report?.scenarios).toContainEqual({ exitCode: 2, timedOut: false })
  })

  it('reports a job that threw with null scenarios', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Boom report',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    const reports: RenderJobReport[] = []
    const runner = { render: () => Promise.reject(new Error('sandbox down')) }
    await processNextRenderJob(db, runner, { onJobFinished: (r) => reports.push(r) })
    expect(reports).toEqual([expect.objectContaining({ versionId, scenarios: null })])
  })

  it('forwards a network version token disclosure to every render scenario', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Token usage',
      description: '',
      interpreter: 'bash',
      source:
        '#!/bin/bash\ntoken=$(jq -r .claudeAiOauth.accessToken ~/.claude/.credentials.json)\ncurl -H "Authorization: Bearer $token" https://api.anthropic.com/api/oauth/usage',
      networkHosts: ['api.anthropic.com'],
    })
    await runNetworkPreview(db, versionId)
    const seen: RenderInput[] = []
    const runner: SandboxRunner = {
      async render(input): Promise<RenderResult> {
        seen.push(input)
        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          timedOut: false,
          trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
        }
      },
    }

    await processNextRenderJob(db, runner)

    expect(seen).toHaveLength(8)
    expect(seen.every((input) => input.networkHosts?.[0] === 'api.anthropic.com')).toBe(true)
    expect(seen.every((input) => input.readsClaudeToken === true)).toBe(true)
  })
})

describe('drainRenderJobs', () => {
  it('processes every queued job and returns the count', async () => {
    for (const title of ['A', 'B', 'C']) {
      await submitConfig(db, {
        authorId: 'u1',
        title,
        description: '',
        interpreter: 'bash',
        source: `#!/bin/bash\necho ${title}`,
      })
    }
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: '\x1b[35mOpus\x1b[0m' } })
    const { processed } = await drainRenderJobs(db, runner)
    expect(processed).toBe(3)
    const remaining = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.status, 'queued'))
    expect(remaining).toHaveLength(0)
  })

  it('reports each job it drains', async () => {
    for (const title of ['A', 'B']) {
      await submitConfig(db, {
        authorId: 'u1',
        title,
        description: '',
        interpreter: 'bash',
        source: `#!/bin/bash\necho ${title}`,
      })
    }
    const reports: RenderJobReport[] = []
    await drainRenderJobs(db, new FakeSandboxRunner(), { onJobFinished: (r) => reports.push(r) })
    expect(reports).toHaveLength(2)
  })

  it('re-queues and renders a job that a cut-off machine left running', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Cut off',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho cut off',
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'running', startedAt: staleStart() })
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(await drainRenderJobs(db, new FakeSandboxRunner())).toEqual({ processed: 1, cutOff: 1 })
    expect(await jobStatus(versionId)).toBe('done')
  })

  it('claims the next queued job when another drain wins the race for the first', async () => {
    for (const title of ['First', 'Second']) {
      await submitConfig(db, {
        authorId: 'u1',
        title,
        description: '',
        interpreter: 'bash',
        source: `#!/bin/bash\necho ${title}`,
      })
    }

    const processed = await Promise.all([
      drainRenderJobs(db, new FakeSandboxRunner()),
      drainRenderJobs(db, new FakeSandboxRunner()),
    ])

    expect(processed.map((drain) => drain.processed)).toEqual([1, 1])
  })

  it.each([
    [[], 'queued'],
    [['wttr.in'], 'held'],
  ] as const)('once stopped, puts a job with hosts %j back as %s and claims no more', async (networkHosts, putBackAs) => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Cut off by a deploy',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho deploy',
      networkHosts: [...networkHosts],
    })
    if (networkHosts.length > 0) await runNetworkPreview(db, versionId)
    const { versionId: waiting } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Still waiting',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho waiting',
    })
    const stop = new AbortController()
    const runner: SandboxRunner = {
      // The machine is shutting down: this render never gets to finish.
      render() {
        stop.abort()
        return new Promise(() => {})
      },
    }

    expect((await drainRenderJobs(db, runner, { stop: stop.signal })).processed).toBe(0)

    expect(await jobStatus(versionId)).toBe(putBackAs)
    expect(await jobStatus(waiting)).toBe('queued')
  })

  it('returns 0 when nothing is queued', async () => {
    expect(await drainRenderJobs(db, new FakeSandboxRunner())).toEqual({ processed: 0, cutOff: 0 })
  })
})
