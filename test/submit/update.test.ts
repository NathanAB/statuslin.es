import { PGlite } from '@electric-sql/pglite'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from '@/adopt/install'
import * as schema from '@/db/schema'
import { getConfigBySlug, getPublishedConfigs } from '@/gallery/queries'
import { configCardResponse } from '@/og/routes'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { approveVersion, runNetworkPreview } from '@/review/decide'
import { getDashboardRows } from '@/review/queue'
import {
  GLOBAL_RENDER_QUEUE_MAX,
  getUpdateDraft,
  HELD_RENDER_JOBS_MAX,
  type SubmitInput,
  submitConfig,
} from '@/submit/submit'
import { createUpdateVersion, findUpdateBase } from '@/submit/update'
import { processNextRenderJob } from '@/submit/worker'

const configCard = vi.hoisted(() => vi.fn(() => null))
vi.mock('@/og/card', () => ({ configCard, homeCard: vi.fn(() => null) }))
vi.mock('@/og/render', () => ({ toElementPng: vi.fn(async () => new Uint8Array([1])) }))

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values(
    ['owner', 'other', 'filler'].map((id) => ({
      id,
      name: id,
      email: `${id}@test.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  )
})

afterAll(async () => {
  await client.close()
})

beforeEach(async () => {
  await db.delete(schema.configs)
})

const live: SubmitInput = {
  authorId: 'owner',
  title: 'Live line',
  description: 'Live description',
  interpreter: 'bash',
  source: 'echo live',
  networkHosts: [],
}
const update: SubmitInput = {
  ...live,
  title: 'Updated line',
  description: 'Updated description',
  interpreter: 'python',
  source: 'print("updated")',
}

async function publish(input: SubmitInput = live) {
  const result = await submitConfig(db, input)
  if ((input.networkHosts ?? []).length > 0) await runNetworkPreview(db, result.versionId)
  await processNextRenderJob(db, new FakeSandboxRunner())
  await approveVersion(db, result.versionId, 'admin')
  return result
}

const versionsOf = (configId: string) =>
  db
    .select()
    .from(schema.configVersions)
    .where(eq(schema.configVersions.configId, configId))
    .orderBy(asc(schema.configVersions.versionNumber))
const configRow = async (configId: string) =>
  (await db.select().from(schema.configs).where(eq(schema.configs.id, configId)))[0]
const jobOf = async (versionId: string) =>
  (
    await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
  )[0]

describe('getUpdateDraft', () => {
  it('fills the draft from the live version, not a pending update', async () => {
    const v1 = await publish()
    await submitConfig(db, update, { updateSlug: v1.slug })
    await expect(getUpdateDraft(db, v1.slug, 'owner')).resolves.toEqual({
      kind: 'update',
      slug: v1.slug,
      title: live.title,
      description: live.description,
      interpreter: live.interpreter,
      source: live.source,
      networkHosts: [],
    })
  })

  it('returns not found to another user, on read and on write', async () => {
    const v1 = await publish()
    await expect(getUpdateDraft(db, v1.slug, 'other')).rejects.toMatchObject({ status: 404 })
    await expect(
      submitConfig(db, { ...update, authorId: 'other' }, { updateSlug: v1.slug }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('refuses a draft and a removed config', async () => {
    const removed = await publish({ ...live, title: 'Removed line' })
    const draft = await submitConfig(db, live)
    await expect(getUpdateDraft(db, draft.slug, 'owner')).rejects.toMatchObject({ status: 409 })
    await db
      .update(schema.configs)
      .set({ status: 'removed' })
      .where(eq(schema.configs.id, removed.configId))
    await expect(getUpdateDraft(db, removed.slug, 'owner')).rejects.toMatchObject({ status: 409 })
    await expect(submitConfig(db, update, { updateSlug: removed.slug })).rejects.toMatchObject({
      status: 409,
    })
  })
})

describe('submitting an update', () => {
  it('creates the next version as pending and leaves the config row alone', async () => {
    const v1 = await publish()
    const before = await configRow(v1.configId)
    const result = await submitConfig(db, update, { updateSlug: v1.slug })

    expect(result).toMatchObject({ configId: v1.configId, slug: v1.slug })
    expect(await configRow(v1.configId)).toEqual(before)
    const [first, second] = await versionsOf(v1.configId)
    expect(first).toMatchObject({ id: v1.versionId, status: 'approved', title: live.title })
    expect(second).toMatchObject({
      id: result.versionId,
      versionNumber: 2,
      status: 'pending',
      title: update.title,
      description: update.description,
      interpreter: update.interpreter,
      source: update.source,
      networkHosts: [],
    })
    expect((await jobOf(result.versionId))?.status).toBe('queued')
  })

  it('holds the render job when network hosts are declared', async () => {
    const v1 = await publish()
    const result = await submitConfig(
      db,
      { ...update, networkHosts: ['wttr.in'] },
      { updateSlug: v1.slug },
    )
    expect((await jobOf(result.versionId))?.status).toBe('held')
  })

  it('still renders a text-only update', async () => {
    const v1 = await publish()
    const result = await submitConfig(db, { ...live, title: 'Typo fixed' }, { updateSlug: v1.slug })
    expect((await jobOf(result.versionId))?.status).toBe('queued')
  })

  it('carries license and source URL from the live version', async () => {
    const v1 = await publish({ ...live, license: 'MIT', sourceUrl: 'https://example.com/x.sh' })
    const result = await submitConfig(
      db,
      { ...update, license: 'GPL-3.0', sourceUrl: 'https://evil.example' },
      { updateSlug: v1.slug },
    )
    const [, second] = await versionsOf(v1.configId)
    expect(second).toMatchObject({
      id: result.versionId,
      license: 'MIT',
      sourceUrl: 'https://example.com/x.sh',
    })
  })

  it('recomputes the token flag from the new script, both ways', async () => {
    const tokenSource = 'os.environ["CLAUDE_CODE_OAUTH_TOKEN"]'
    const plain = await publish()
    await submitConfig(db, { ...update, source: tokenSource }, { updateSlug: plain.slug })
    expect((await versionsOf(plain.configId))[1]?.readsClaudeToken).toBe(true)

    await db.delete(schema.configs)
    const reads = await publish({ ...live, interpreter: 'python', source: tokenSource })
    expect((await versionsOf(reads.configId))[0]?.readsClaudeToken).toBe(true)
    await submitConfig(db, update, { updateSlug: reads.slug })
    expect((await versionsOf(reads.configId))[1]?.readsClaudeToken).toBe(false)
  })

  it('refuses an update identical to the live version, hosts in any order', async () => {
    const v1 = await publish({ ...live, networkHosts: ['a.example', 'b.example'] })
    await expect(
      submitConfig(
        db,
        { ...live, networkHosts: ['b.example', 'a.example'] },
        { updateSlug: v1.slug },
      ),
    ).rejects.toMatchObject({ status: 400, message: 'Nothing changed from the live version' })
    expect(await versionsOf(v1.configId)).toHaveLength(1)
  })
})

describe('gates apply to updates', () => {
  it.each([
    ['obfuscation', `echo "${'A'.repeat(240)}"`, /looks obfuscated/],
    ['credential access', 'cat ~/.ssh/id_rsa', /non-Claude credentials/],
  ])('runs the %s check', async (_name, source, message) => {
    const v1 = await publish()
    await expect(submitConfig(db, { ...update, source }, { updateSlug: v1.slug })).rejects.toThrow(
      message,
    )
  })

  it('counts updates toward the hourly rate limit', async () => {
    const v1 = await publish()
    await submitConfig(db, { ...update, source: 'echo v2' }, { updateSlug: v1.slug })
    await submitConfig(db, { ...update, source: 'echo v3' }, { updateSlug: v1.slug })
    await expect(
      submitConfig(db, { ...update, source: 'echo v4' }, { updateSlug: v1.slug }),
    ).rejects.toMatchObject({ status: 429 })
  })

  async function fillJobs(count: number, status: string) {
    const filler = await submitConfig(db, { ...live, authorId: 'filler', source: 'echo filler' })
    await db
      .insert(schema.renderJobs)
      .values(Array.from({ length: count }, () => ({ configVersionId: filler.versionId, status })))
  }

  it('applies the global render queue cap', async () => {
    const v1 = await publish()
    await fillJobs(GLOBAL_RENDER_QUEUE_MAX, 'queued')
    await expect(submitConfig(db, update, { updateSlug: v1.slug })).rejects.toThrow(
      /Render queue is full/,
    )
  })

  it('applies the held-job cap to a network update', async () => {
    const v1 = await publish()
    await fillJobs(HELD_RENDER_JOBS_MAX, 'held')
    await expect(
      submitConfig(db, { ...update, networkHosts: ['wttr.in'] }, { updateSlug: v1.slug }),
    ).rejects.toThrow(/Network review queue is full/)
  })
})

describe('a newer update replaces a pending one', () => {
  it('supersedes the older version, drops its unfinished job and sends no email', async () => {
    const v1 = await publish()
    const older = await submitConfig(db, update, { updateSlug: v1.slug })
    const newer = await submitConfig(
      db,
      { ...update, source: 'print("newer")' },
      {
        updateSlug: v1.slug,
      },
    )

    const [, second, third] = await versionsOf(v1.configId)
    expect(second).toMatchObject({
      id: older.versionId,
      status: 'superseded',
      rejectionEmailStatus: null,
      approvalEmailStatus: null,
    })
    expect(third).toMatchObject({ id: newer.versionId, versionNumber: 3, status: 'pending' })
    expect(await jobOf(older.versionId)).toBeUndefined()
    const queued = (await getDashboardRows(db)).map((row) => row.version.id)
    expect(queued).toContain(newer.versionId)
    expect(queued).not.toContain(older.versionId)
  })

  it('returns 409 to the loser of two simultaneous submits', async () => {
    const v1 = await publish()
    const firstBase = await findUpdateBase(db, v1.slug, 'owner')
    const secondBase = await findUpdateBase(db, v1.slug, 'owner')
    const prepared = {
      ...update,
      networkHosts: [],
      contentSha256: 'sha',
      sourceHtml: null,
      readsClaudeToken: false,
      license: null,
      sourceUrl: null,
    }

    await createUpdateVersion(db, firstBase, prepared)
    await expect(
      createUpdateVersion(db, secondBase, { ...prepared, source: 'print("second")' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await versionsOf(v1.configId)).toHaveLength(2)
  })
})

describe('public reads while an update is pending', () => {
  it('keep showing the live version', async () => {
    const v1 = await publish()
    await submitConfig(db, update, { updateSlug: v1.slug })

    const detail = await getConfigBySlug(db, v1.slug)
    expect(detail).toMatchObject({
      title: live.title,
      description: live.description,
      interpreter: live.interpreter,
      source: live.source,
    })
    expect(runCommand(detail!.interpreter, detail!.source)).toBe(
      runCommand(live.interpreter, live.source),
    )
    const [card] = await getPublishedConfigs(db, 'new')
    expect(card).toMatchObject({ slug: v1.slug, title: live.title })
    await configCardResponse(db, v1.slug)
    expect(configCard).toHaveBeenLastCalledWith(expect.objectContaining({ title: live.title }))
  })
})
