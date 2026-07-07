import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { approveVersion } from '@/review/decide'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let configId: string
let versionId: string

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
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
      title: 'T',
      authorId: 'u1',
      interpreter: 'node',
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
      source: 'console.log("hi")',
      interpreter: 'node',
      contentSha256: 'sha-all-tags-recompute',
      status: 'pending',
      networkHosts: ['api.example.com'],
      readsClaudeToken: true,
    })
    .returning()
  if (!ver) throw new Error('no version')
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
