import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { getFacetCards, getFacetStats } from '@/gallery/queries'

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

async function seed(
  slug: string,
  opts: {
    tags?: string[]
    interpreter?: string
    status?: string
    upvoteCount?: number
    createdAt?: Date
  } = {},
) {
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: slug,
      description: 'desc',
      authorId: 'u1',
      interpreter: opts.interpreter ?? 'bash',
      status: opts.status ?? 'published',
      tags: opts.tags ?? [],
      upvoteCount: opts.upvoteCount ?? 0,
      createdAt: opts.createdAt ?? new Date(2026, 0, 1),
    })
    .returning()
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg!.id,
      versionNumber: 1,
      source: 'echo hi',
      interpreter: opts.interpreter ?? 'bash',
      contentSha256: slug.padEnd(64, '0'),
      status: 'approved',
    })
    .returning()
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver!.id })
    .where(eq(schema.configs.id, cfg!.id))
}

describe('facet queries', () => {
  beforeAll(async () => {
    await seed('git-a', { tags: ['git'], upvoteCount: 5, createdAt: new Date(2026, 5, 1) })
    await seed('git-b', { tags: ['git', 'cost'], upvoteCount: 9, createdAt: new Date(2026, 5, 2) })
    await seed('git-draft', { tags: ['git'], status: 'draft' })
    await seed('py-a', { interpreter: 'python', createdAt: new Date(2026, 5, 3) })
    await seed('plain', {})
  })

  it('counts published matches per facet with the newest createdAt', async () => {
    const stats = await getFacetStats(db)
    expect(stats.get('git')).toEqual({ count: 2, latest: new Date(2026, 5, 2) })
    expect(stats.get('cost')?.count).toBe(1)
    expect(stats.get('python')).toEqual({ count: 1, latest: new Date(2026, 5, 3) })
    // every registry facet is present, even with zero matches
    expect(stats.get('powerline')).toEqual({ count: 0, latest: null })
  })

  it('excludes drafts everywhere', async () => {
    const cards = await getFacetCards(db, FACET_BY_SLUG.get('git')!)
    expect(cards.map((c) => c.slug)).not.toContain('git-draft')
  })

  it('returns tag-facet cards by upvotes then newest', async () => {
    const cards = await getFacetCards(db, FACET_BY_SLUG.get('git')!)
    expect(cards.map((c) => c.slug)).toEqual(['git-b', 'git-a'])
  })

  it('returns interpreter-facet cards from the interpreter column', async () => {
    const cards = await getFacetCards(db, FACET_BY_SLUG.get('python')!)
    expect(cards.map((c) => c.slug)).toEqual(['py-a'])
  })
})
