import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPublishedSlugsForSitemap } from '@/gallery/queries'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author One',
    username: 'authorone',
    email: 'author1@test.com',
    image: 'https://example.com/avatar.png',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
afterAll(async () => {
  await client.close()
})

describe('getPublishedSlugsForSitemap', () => {
  it('returns only current-version published configs with reviewedAt or createdAt fallback', async () => {
    const reviewed = await insertConfig('reviewed-current', 'published', '2026-01-01')
    const [reviewedVersion] = await db
      .insert(schema.configVersions)
      .values({
        configId: reviewed.id,
        versionNumber: 1,
        source: 'echo reviewed',
        interpreter: 'bash',
        contentSha256: 'reviewed-current'.padEnd(64, '0'),
        status: 'approved',
        reviewedAt: new Date('2026-04-05T12:00:00Z'),
      })
      .returning()
    await db.insert(schema.configVersions).values({
      configId: reviewed.id,
      versionNumber: 2,
      source: 'echo not current',
      interpreter: 'bash',
      contentSha256: 'reviewed-not-current'.padEnd(64, '0'),
      status: 'approved',
      reviewedAt: new Date('2026-12-31T00:00:00Z'),
    })
    await setCurrentVersion(reviewed.id, reviewedVersion!.id)

    const fallback = await insertConfig('created-fallback', 'published', '2026-03-03')
    const [fallbackVersion] = await db
      .insert(schema.configVersions)
      .values({
        configId: fallback.id,
        versionNumber: 1,
        source: 'echo fallback',
        interpreter: 'bash',
        contentSha256: 'created-fallback'.padEnd(64, '0'),
        status: 'approved',
      })
      .returning()
    await setCurrentVersion(fallback.id, fallbackVersion!.id)

    const draft = await insertConfig('draft-hidden', 'draft', '2026-06-01')
    const [draftVersion] = await db
      .insert(schema.configVersions)
      .values({
        configId: draft.id,
        versionNumber: 1,
        source: 'echo draft',
        interpreter: 'bash',
        contentSha256: 'draft-hidden'.padEnd(64, '0'),
        status: 'approved',
        reviewedAt: new Date('2026-06-02T00:00:00Z'),
      })
      .returning()
    await setCurrentVersion(draft.id, draftVersion!.id)

    await insertConfig('orphan-hidden', 'published', '2026-07-01')
    await db.insert(schema.configs).values({
      slug: 'unknown-current-hidden',
      title: 'unknown-current-hidden',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
      currentVersionId: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    })

    const rows = await getPublishedSlugsForSitemap(db)
    expect(rows).toEqual([
      { slug: 'reviewed-current', updatedAt: new Date('2026-04-05T12:00:00Z') },
      { slug: 'created-fallback', updatedAt: new Date('2026-03-03T00:00:00Z') },
    ])
  })
})

async function insertConfig(slug: string, status: string, createdDate: string) {
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: slug,
      authorId: 'u1',
      interpreter: 'bash',
      status,
      createdAt: new Date(`${createdDate}T00:00:00Z`),
    })
    .returning()
  return config!
}

async function setCurrentVersion(configId: string, currentVersionId: string) {
  await db.update(schema.configs).set({ currentVersionId }).where(eq(schema.configs.id, configId))
}
