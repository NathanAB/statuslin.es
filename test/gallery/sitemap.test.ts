import { PGlite } from '@electric-sql/pglite'
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
  it('returns only published configs, with slug and createdAt, newest first', async () => {
    await db.insert(schema.configs).values([
      {
        slug: 'pub-old',
        title: 'Old',
        authorId: 'u1',
        interpreter: 'bash',
        status: 'published',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        slug: 'pub-new',
        title: 'New',
        authorId: 'u1',
        interpreter: 'bash',
        status: 'published',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
      {
        slug: 'draft-hidden',
        title: 'Draft',
        authorId: 'u1',
        interpreter: 'bash',
        status: 'draft',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ])

    const rows = await getPublishedSlugsForSitemap(db)
    const slugs = rows.map((r) => r.slug)

    expect(slugs).toContain('pub-old')
    expect(slugs).toContain('pub-new')
    expect(slugs).not.toContain('draft-hidden')
    expect(slugs.indexOf('pub-new')).toBeLessThan(slugs.indexOf('pub-old'))
    expect(rows.find((r) => r.slug === 'pub-new')?.createdAt).toBeInstanceOf(Date)
  })
})
