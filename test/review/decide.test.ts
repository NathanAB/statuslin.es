import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { approveVersion, rejectVersion, requeueRenderJob, runNetworkPreview } from '@/review/decide'
import { submitConfig } from '@/submit/submit'
import { processNextRenderJob } from '@/submit/worker'

async function seedVersionWithJob(
  db: ReturnType<typeof drizzle<typeof schema>>,
  opts: { status: 'queued' | 'running' | 'done' | 'failed' | 'held'; networkHosts: string[] },
): Promise<string> {
  // assumes an author 'u1' is seeded in beforeAll, like the other DB tests
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug: `s-${Date.now()}-${Math.random()}`,
      title: 'T',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
    })
    .returning()
  if (!cfg) throw new Error('no config')
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      source: '#!/bin/bash\necho hi',
      interpreter: 'bash',
      contentSha256: `sha-${Math.random()}`,
      status: 'pending',
      networkHosts: opts.networkHosts,
    })
    .returning()
  if (!ver) throw new Error('no version')
  await db.insert(schema.renderJobs).values({ configVersionId: ver.id, status: opts.status })
  return ver.id
}

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

describe('approveVersion', () => {
  it('approves the version and publishes the config after render is done', async () => {
    const { configId, versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'A',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())
    await approveVersion(db, versionId, 'admin1')
    const vRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    const v = vRows[0]
    expect(v?.status).toBe('approved')
    expect(v?.reviewedBy).toBe('admin1')
    const cRows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    const c = cRows[0]
    expect(c?.status).toBe('published')
    expect(c?.currentVersionId).toBe(versionId)
  })

  it('throws if the render job is not done', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'B',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await expect(approveVersion(db, versionId, 'admin1')).rejects.toMatchObject({ status: 409 })
  })
})

describe('rejectVersion', () => {
  it('rejects the version, leaves the config unpublished', async () => {
    const { configId, versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'R',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await rejectVersion(db, versionId, 'admin1')
    const vRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    const v = vRows[0]
    expect(v?.status).toBe('rejected')
    const cRows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    const c = cRows[0]
    expect(c?.status).toBe('draft')
  })

  it('throws when rejecting a non-existent version', async () => {
    await expect(
      rejectVersion(db, '00000000-0000-0000-0000-000000000000', 'admin1'),
    ).rejects.toThrow('version not in a reviewable (pending) state')
  })
})

describe('requeueRenderJob', () => {
  it('resets a failed render job to queued, clearing error/attempts/finishedAt', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Requeue',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'failed', error: 'boom', attempts: 3, finishedAt: new Date() })
      .where(eq(schema.renderJobs.configVersionId, versionId))

    await requeueRenderJob(db, versionId)

    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
    expect(job?.error).toBeNull()
    expect(job?.attempts).toBe(0)
    expect(job?.finishedAt).toBeNull()
  })

  it('throws when there is no render job for the version', async () => {
    await expect(requeueRenderJob(db, '00000000-0000-0000-0000-000000000000')).rejects.toThrow()
  })

  it('refuses to re-queue an already-done render job', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'AlreadyDone',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'done', finishedAt: new Date() })
      .where(eq(schema.renderJobs.configVersionId, versionId))

    await expect(requeueRenderJob(db, versionId)).rejects.toThrow()

    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('done')
  })
})

describe('runNetworkPreview', () => {
  it('promotes a held job to queued', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'held', networkHosts: ['wttr.in'] })
    await runNetworkPreview(db, versionId)
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
  })

  it('refuses when the job is not held', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'done', networkHosts: ['wttr.in'] })
    await expect(runNetworkPreview(db, versionId)).rejects.toThrow(/held/i)
  })
})

describe('requeueRenderJob held-job invariant', () => {
  it('refuses to re-queue a held job', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'held', networkHosts: ['wttr.in'] })
    await expect(requeueRenderJob(db, versionId)).rejects.toThrow()
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('held') // untouched
  })

  it('still re-queues a failed job', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'failed', networkHosts: [] })
    await requeueRenderJob(db, versionId)
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
  })
})
