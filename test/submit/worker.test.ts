import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { getPreviews } from '@/render/store'
import type { RenderInput, RenderResult, SandboxRunner } from '@/render/types'
import { runNetworkPreview } from '@/review/decide'
import { submitConfig } from '@/submit/submit'
import { drainRenderJobs, processNextRenderJob, requeueStaleJobs } from '@/submit/worker'

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

describe('requeueStaleJobs', () => {
  it('resets running jobs to queued and returns the count; leaves done jobs untouched', async () => {
    // Insert a job in 'running' state (simulates a crashed worker)
    const { versionId: runningVersionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Stale',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho stale',
    })
    const runningJobRows = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, runningVersionId))
    const runningJob = runningJobRows[0]
    if (!runningJob) throw new Error('render job row not found')
    await db
      .update(schema.renderJobs)
      .set({ status: 'running' })
      .where(eq(schema.renderJobs.id, runningJob.id))

    // Insert a job in 'done' state (should be left untouched)
    const { versionId: doneVersionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Done',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho done',
    })
    const doneJobRows = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, doneVersionId))
    const doneJob = doneJobRows[0]
    if (!doneJob) throw new Error('render job row not found')
    await db
      .update(schema.renderJobs)
      .set({ status: 'done' })
      .where(eq(schema.renderJobs.id, doneJob.id))

    const count = await requeueStaleJobs(db)
    expect(count).toBe(1)

    const requeued = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, runningJob.id))
    expect(requeued[0]?.status).toBe('queued')

    const stillDone = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.id, doneJob.id))
    expect(stillDone[0]?.status).toBe('done')

    // Clean up: neutralize requeued job so it doesn't pollute later tests
    await db
      .update(schema.renderJobs)
      .set({ status: 'failed' })
      .where(eq(schema.renderJobs.id, runningJob.id))
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
    const processed = await drainRenderJobs(db, runner)
    expect(processed).toBe(3)
    const remaining = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.status, 'queued'))
    expect(remaining).toHaveLength(0)
  })

  it('returns 0 when nothing is queued', async () => {
    expect(await drainRenderJobs(db, new FakeSandboxRunner())).toBe(0)
  })
})

describe('requeueStaleJobs network branching', () => {
  it('resets a stale NETWORK running job to held, not queued', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Net stale',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\ncurl -s wttr.in',
      networkHosts: ['wttr.in'],
    })
    // Simulate a crash mid network-render: force the held job to 'running'.
    await db
      .update(schema.renderJobs)
      .set({ status: 'running' })
      .where(eq(schema.renderJobs.configVersionId, versionId))
    await requeueStaleJobs(db)
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('held')
  })

  it('still resets a stale OFFLINE running job to queued', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Offline stale',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho hi',
      networkHosts: [],
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'running' })
      .where(eq(schema.renderJobs.configVersionId, versionId))
    await requeueStaleJobs(db)
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
  })
})
