import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPublishedConfigs } from '@/gallery/queries'
import { seedLoadConfigs } from '../../scripts/loadtest/seed'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})
afterAll(async () => {
  await client.close()
})

describe('seedLoadConfigs', () => {
  it('seeds N published configs, each with a clean-main preview and an author', async () => {
    const summary = await seedLoadConfigs(db, { count: 5 })
    expect(summary.created).toBe(5)
    expect(summary.authors).toBeGreaterThanOrEqual(1)

    const cards = await getPublishedConfigs(db, 'new')
    const seeded = cards.filter((c) => c.slug.startsWith('loadtest-'))
    expect(seeded.length).toBe(5)
    for (const card of seeded) {
      // The gallery card renders the clean-main preview; it must have real segments.
      expect(card.preview?.length ?? 0).toBeGreaterThan(0)
      expect(card.author).not.toBeNull()
    }
    // Varied counts so all three sorts (new/top/trending) produce real orderings.
    expect(new Set(seeded.map((c) => c.upvoteCount)).size).toBeGreaterThan(1)
    expect(new Set(seeded.map((c) => c.copyCount)).size).toBeGreaterThan(1)

    // The varied upvote counts must actually drive a non-degenerate `top` ordering.
    const topUpvotes = (await getPublishedConfigs(db, 'top'))
      .filter((c) => c.slug.startsWith('loadtest-'))
      .map((c) => c.upvoteCount)
    expect(topUpvotes).toEqual([...topUpvotes].sort((a, b) => b - a))
  })

  it('is idempotent: re-running the same count creates nothing new', async () => {
    const before = await getPublishedConfigs(db, 'new')
    const summary = await seedLoadConfigs(db, { count: 5 })
    expect(summary.created).toBe(0)
    expect(summary.skipped).toBe(5)
    const after = await getPublishedConfigs(db, 'new')
    expect(after.length).toBe(before.length)
  })
})
