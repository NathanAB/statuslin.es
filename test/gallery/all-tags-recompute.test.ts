import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { approveVersion } from '@/review/decide'
import { insertSubmission } from '../fixtures/submission'
import { migratedPGlite } from '../helpers/test-db'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let configId: string
let versionId: string

beforeAll(async () => {
  client = await migratedPGlite()
  db = drizzle({ client, schema })
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

  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug: 'all-tags-recompute',
      authorId: 'u1',
      status: 'draft',
      tags: ['quota'],
    })
    .returning()
  if (!cfg) throw new Error('no config')
  configId = cfg.id

  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      title: 'T',
      source: 'console.log("hi")',
      interpreter: 'node',
      contentSha256: 'sha-all-tags-recompute',
      networkHosts: ['api.example.com'],
      readsClaudeToken: true,
    })
    .returning()
  if (!ver) throw new Error('no version')
  await insertSubmission(db, ver.id, 'u1')
  versionId = ver.id

  await db.insert(schema.renderJobs).values({ configVersionId: ver.id, status: 'done' })
})

afterAll(async () => {
  await client.close()
})

describe('approveVersion → allTags', () => {
  it('materializes curated ∪ derived on publish', async () => {
    await approveVersion(db, versionId, 'admin1')
    const [row] = await db
      .select({ allTags: schema.configs.allTags })
      .from(schema.configs)
      .where(eq(schema.configs.id, configId))
    expect(new Set(row?.allTags)).toEqual(
      new Set(['quota', 'node', 'network-access', 'reads-token']),
    )
  })
})
