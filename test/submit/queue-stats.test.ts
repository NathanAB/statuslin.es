import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { queueDepthStats } from '@/submit/worker'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db
    .insert(schema.user)
    .values({
      id: 'u1',
      name: 'A',
      email: 'a@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})
beforeEach(async () => {
  await db.delete(schema.configs)
  await db.delete(schema.renderJobs)
})

// Insert a queued render job whose createdAt is `ageSec` seconds ago.
async function seedQueuedJob(ageSec: number, sha: string) {
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug: `s-${sha.slice(0, 6)}`,
      title: 'T',
      description: '',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
    })
    .returning()
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg!.id,
      versionNumber: 1,
      source: '#!/bin/bash\necho x',
      interpreter: 'bash',
      contentSha256: sha,
      status: 'pending',
    })
    .returning()
  await db.insert(schema.renderJobs).values({
    configVersionId: ver!.id,
    status: 'queued',
    createdAt: new Date(Date.now() - ageSec * 1000),
  })
}

describe('queueDepthStats', () => {
  it('reports 0/0 with an empty queue', async () => {
    expect(await queueDepthStats(db)).toEqual({ queuedRemaining: 0, oldestQueuedAgeSec: 0 })
  })
  it('counts queued jobs and the oldest age', async () => {
    await seedQueuedJob(1200, 'a'.repeat(64)) // 20 min
    await seedQueuedJob(60, 'b'.repeat(64)) // 1 min
    const stats = await queueDepthStats(db)
    expect(stats.queuedRemaining).toBe(2)
    expect(stats.oldestQueuedAgeSec).toBeGreaterThanOrEqual(1200)
  })
})
