import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { getDashboardRows, getMySubmissionRows } from '@/review/queue'
import { submitConfig } from '@/submit/submit'
import { processNextRenderJob } from '@/submit/worker'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  // Seed the authors referenced by the configs FK (author_id → user.id). Two authors keep us
  // under the 10-submissions-per-author rate limit across the whole file.
  for (const id of ['u1', 'u2']) {
    await db
      .insert(schema.user)
      .values({
        id,
        name: `Author ${id}`,
        email: `${id}@test.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
  }
})
afterAll(async () => {
  await client.close()
})

function findByVersion(rows: Awaited<ReturnType<typeof getDashboardRows>>, versionId: string) {
  return rows.find((r) => r.version.id === versionId)
}

describe('getDashboardRows', () => {
  it('lists a submission that is still queued (not yet rendered)', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Queued',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho hi',
    })
    const row = findByVersion(await getDashboardRows(db), versionId)
    expect(row).toBeDefined()
    expect(row?.renderJob.status).toBe('queued')
    expect(row?.previews).toHaveLength(0)
  })

  it('lists a rendered (done) submission with its previews', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Done',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho done',
    })
    // The worker renders oldest-queued first, so drain any earlier queued jobs until ours is done.
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: 'x' } })
    for (let i = 0; i < 10; i++) {
      const row = findByVersion(await getDashboardRows(db), versionId)
      if (row?.renderJob.status === 'done') break
      if (!(await processNextRenderJob(db, runner))) break
    }
    const row = findByVersion(await getDashboardRows(db), versionId)
    expect(row?.renderJob.status).toBe('done')
    expect(row?.previews.length).toBeGreaterThan(0)
  })

  it('lists a failed submission with its error and attempt count', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Failed',
      description: '',
      interpreter: 'bash',
      source: 'boom',
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'failed', error: 'sandbox exploded', attempts: 2 })
      .where(eq(schema.renderJobs.configVersionId, versionId))
    const row = findByVersion(await getDashboardRows(db), versionId)
    expect(row?.renderJob.status).toBe('failed')
    expect(row?.renderJob.error).toBe('sandbox exploded')
    expect(row?.renderJob.attempts).toBe(2)
  })

  it('excludes versions that have been approved or rejected', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u2',
      title: 'Decided',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    expect(findByVersion(await getDashboardRows(db), versionId)).toBeDefined()
    await db
      .update(schema.configVersions)
      .set({ status: 'approved' })
      .where(eq(schema.configVersions.id, versionId))
    expect(findByVersion(await getDashboardRows(db), versionId)).toBeUndefined()
  })

  it('returns one row per version even if a second render job exists', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u2',
      title: 'DupJob',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    // Simulate a stray second render-job row for the same version (no DB uniqueness enforces this).
    await db.insert(schema.renderJobs).values({ configVersionId: versionId })
    const matching = (await getDashboardRows(db)).filter((r) => r.version.id === versionId)
    expect(matching).toHaveLength(1)
  })

  it('orders problems first: failed, then running, then queued, then done', async () => {
    const rows = await getDashboardRows(db)
    const priority: Record<string, number> = { failed: 0, running: 1, queued: 2, done: 3 }
    const seq = rows.map((r) => priority[r.renderJob.status] ?? 99)
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1] ?? 0)
    }
  })
})

describe('getMySubmissionRows', () => {
  it('returns only the given author’s configs, with render state, any status', async () => {
    for (const id of ['me1', 'other1']) {
      await db
        .insert(schema.user)
        .values({
          id,
          name: id,
          email: `${id}@test.com`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
    }
    const mine = await submitConfig(db, {
      authorId: 'me1',
      title: 'Mine',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho mine',
    })
    await submitConfig(db, {
      authorId: 'other1',
      title: 'Theirs',
      description: '',
      interpreter: 'bash',
      source: '#!/bin/bash\necho theirs',
    })
    const rows = await getMySubmissionRows(db, 'me1')
    expect(rows.every((r) => r.config.authorId === 'me1')).toBe(true)
    expect(rows.some((r) => r.config.id === mine.configId)).toBe(true)
    expect(rows.some((r) => r.config.title === 'Theirs')).toBe(false)
    // render state is attached
    expect(rows.find((r) => r.config.id === mine.configId)?.renderJob.status).toBe('queued')
  })

  it('returns the latest version when a config has more than one', async () => {
    const { configId } = await submitConfig(db, {
      authorId: 'me1',
      title: 'Versioned',
      description: '',
      interpreter: 'bash',
      source: 'v1',
    })
    const [v2] = await db
      .insert(schema.configVersions)
      .values({
        configId,
        versionNumber: 2,
        source: 'v2',
        interpreter: 'bash',
        contentSha256: 'sha-v2-aaaaaaaa',
        status: 'pending',
      })
      .returning()
    await db.insert(schema.renderJobs).values({ configVersionId: v2!.id })
    const row = (await getMySubmissionRows(db, 'me1')).find((r) => r.config.id === configId)
    expect(row?.version.versionNumber).toBe(2)
    expect(row?.version.source).toBe('v2')
  })
})
