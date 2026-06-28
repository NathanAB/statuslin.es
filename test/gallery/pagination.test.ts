import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { coercePage, getPublishedConfigs, getPublishedCount, PAGE_SIZE } from '@/gallery/queries'

describe('coercePage', () => {
  it('passes through positive integers (as string or number)', () => {
    expect(coercePage('2')).toBe(2)
    expect(coercePage(3)).toBe(3)
  })
  it('floors fractionals', () => {
    expect(coercePage(2.9)).toBe(2)
  })
  it('falls back to 1 for missing / zero / negative / non-numeric', () => {
    expect(coercePage(undefined)).toBe(1)
    expect(coercePage(null)).toBe(1)
    expect(coercePage('0')).toBe(1)
    expect(coercePage('-4')).toBe(1)
    expect(coercePage('abc')).toBe(1)
    expect(coercePage({})).toBe(1)
  })
})

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author',
    username: 'author',
    email: 'a@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
afterAll(async () => {
  await client.close()
})

// Seed a published config with a deterministic createdAt; no preview needed for pagination.
async function seedPublished(slug: string, createdAt: Date) {
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: slug,
      description: 'desc',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
      createdAt,
    })
    .returning()
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg!.id,
      versionNumber: 1,
      source: 'echo hi',
      interpreter: 'bash',
      contentSha256: slug.padEnd(64, '0'),
      status: 'approved',
    })
    .returning()
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver!.id })
    .where(eq(schema.configs.id, cfg!.id))
}

describe('getPublishedConfigs pagination', () => {
  beforeAll(async () => {
    // One more than a full page, plus a draft that must not be counted or returned.
    for (let i = 0; i < PAGE_SIZE + 1; i++) {
      await seedPublished(`pub-${String(i).padStart(2, '0')}`, new Date(2026, 0, 1, 0, i))
    }
    await db.insert(schema.configs).values({
      slug: 'a-draft',
      title: 'Draft',
      description: '',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
    })
  })

  it('counts only published configs', async () => {
    expect(await getPublishedCount(db)).toBe(PAGE_SIZE + 1)
  })

  it('returns a full page of newest-first cards on page 1', async () => {
    const page1 = await getPublishedConfigs(db, 'new', 1)
    expect(page1).toHaveLength(PAGE_SIZE)
    // Newest seeded (highest minute) comes first.
    expect(page1[0]?.slug).toBe(`pub-${String(PAGE_SIZE).padStart(2, '0')}`)
  })

  it('returns the overflow on page 2', async () => {
    const page2 = await getPublishedConfigs(db, 'new', 2)
    expect(page2).toHaveLength(1)
    expect(page2[0]?.slug).toBe('pub-00') // the oldest
  })
})
