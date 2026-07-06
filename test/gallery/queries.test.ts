import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPublishedConfigs } from '@/gallery/queries'
import { storePreviews } from '@/render/store'

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
      username: 'authorone',
      email: 'author1@test.com',
      image: 'https://example.com/avatar.png',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

interface SeedOpts {
  slug: string
  title: string
  sha: string
  upvoteCount?: number
  copyCount?: number
  createdAt?: Date
  networkHosts?: string[]
}

async function seedPublished(opts: SeedOpts) {
  // Insert the config first so the version's config_id FK is satisfiable, then
  // back-patch the config's current_version_id (which has no FK constraint).
  const cfgRows = await db
    .insert(schema.configs)
    .values({
      slug: opts.slug,
      title: opts.title,
      description: 'desc',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
      upvoteCount: opts.upvoteCount ?? 0,
      copyCount: opts.copyCount ?? 0,
      ...(opts.createdAt !== undefined ? { createdAt: opts.createdAt } : {}),
    })
    .returning()
  const cfg = cfgRows[0]!
  const verRows = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      source: '#!/usr/bin/env bash\necho hi',
      interpreter: 'bash',
      contentSha256: opts.sha,
      status: 'approved',
      ...(opts.networkHosts !== undefined ? { networkHosts: opts.networkHosts } : {}),
    })
    .returning()
  const ver = verRows[0]!
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver.id })
    .where(eq(schema.configs.id, cfg.id))
  await storePreviews(db, opts.sha, [
    {
      scenarioKey: 'clean-main',
      segments: [
        { text: opts.title, fg: null, bg: null, bold: false, italic: false, underline: false },
      ],
      rawStdout: opts.title,
      exitCode: 0,
      timedOut: false,
      trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
    },
  ])
  return cfg
}

describe('getPublishedConfigs', () => {
  it('returns only published configs, newest first, with the clean-main preview', async () => {
    await seedPublished({ slug: 'older', title: 'Older', sha: 'a'.repeat(64) })
    await seedPublished({ slug: 'newer', title: 'Newer', sha: 'b'.repeat(64) })
    await db.insert(schema.configs).values({
      slug: 'draft-one',
      title: 'Draft',
      description: '',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
    })

    const cards = await getPublishedConfigs(db, 'new')
    const slugs = cards.map((c) => c.slug)
    expect(slugs).toContain('older')
    expect(slugs).toContain('newer')
    expect(slugs).not.toContain('draft-one')
    expect(slugs.indexOf('newer')).toBeLessThan(slugs.indexOf('older'))
    expect(cards.find((c) => c.slug === 'newer')?.preview?.[0]?.text).toBe('Newer')
  })

  it('carries the version networkHosts onto the card', async () => {
    await seedPublished({
      slug: 'net-yes',
      title: 'NetYes',
      sha: 'c'.repeat(64),
      networkHosts: ['wttr.in'],
    })
    await seedPublished({ slug: 'net-no', title: 'NetNo', sha: 'd'.repeat(64) })

    const cards = await getPublishedConfigs(db)
    expect(cards.find((c) => c.slug === 'net-yes')?.networkHosts).toEqual(['wttr.in'])
    expect(cards.find((c) => c.slug === 'net-no')?.networkHosts).toEqual([])
  })
})

describe('getPublishedConfigs sorting', () => {
  // Fixed base date so tests are deterministic regardless of when they run.
  const BASE = new Date('2026-01-01T00:00:00Z')
  const msPerHour = 60 * 60 * 1000
  const msPerDay = 24 * msPerHour

  it('top: returns cards ordered by upvoteCount descending', async () => {
    await seedPublished({
      slug: 'sort-top-5',
      title: 'Top5',
      sha: '1'.repeat(64),
      upvoteCount: 5,
      createdAt: new Date(BASE.getTime() - msPerDay),
    })
    await seedPublished({
      slug: 'sort-top-1',
      title: 'Top1',
      sha: '2'.repeat(64),
      upvoteCount: 1,
      createdAt: new Date(BASE.getTime() - 2 * msPerDay),
    })
    await seedPublished({
      slug: 'sort-top-3',
      title: 'Top3',
      sha: '3'.repeat(64),
      upvoteCount: 3,
      createdAt: new Date(BASE.getTime() - 3 * msPerDay),
    })

    const cards = await getPublishedConfigs(db, 'top')
    // We only care about the relative order of our three seeded slugs.
    const relevant = cards.filter((c) =>
      ['sort-top-5', 'sort-top-1', 'sort-top-3'].includes(c.slug),
    )
    const counts = relevant.map((c) => c.upvoteCount)
    expect(counts[0]).toBe(5)
    expect(counts[1]).toBe(3)
    expect(counts[2]).toBe(1)
  })

  it('new: returns cards ordered by createdAt descending', async () => {
    const t1 = new Date('2025-03-01T00:00:00Z')
    const t2 = new Date('2025-06-01T00:00:00Z')
    const t3 = new Date('2025-09-01T00:00:00Z')
    await seedPublished({
      slug: 'sort-new-oldest',
      title: 'NewOldest',
      sha: '4'.repeat(64),
      createdAt: t1,
    })
    await seedPublished({
      slug: 'sort-new-mid',
      title: 'NewMid',
      sha: '5'.repeat(64),
      createdAt: t2,
    })
    await seedPublished({
      slug: 'sort-new-newest',
      title: 'NewNewest',
      sha: '6'.repeat(64),
      createdAt: t3,
    })

    const cards = await getPublishedConfigs(db, 'new')
    const relevant = cards.filter((c) =>
      ['sort-new-oldest', 'sort-new-mid', 'sort-new-newest'].includes(c.slug),
    )
    const slugs = relevant.map((c) => c.slug)
    expect(slugs.indexOf('sort-new-newest')).toBeLessThan(slugs.indexOf('sort-new-mid'))
    expect(slugs.indexOf('sort-new-mid')).toBeLessThan(slugs.indexOf('sort-new-oldest'))
  })

  it('trending: ranks by copies over time, not upvotes', async () => {
    // SQL now() reflects the real wall clock, so anchor relative to actual Date.now().
    // Same age, so age cancels out: the more-copied config wins despite fewer upvotes.
    const sameAge = new Date(Date.now() - 1 * msPerHour)
    await seedPublished({
      slug: 'trend-copies',
      title: 'Copies',
      sha: '7'.repeat(64),
      copyCount: 100,
      upvoteCount: 1,
      createdAt: sameAge,
    })
    await seedPublished({
      slug: 'trend-votes',
      title: 'Votes',
      sha: '8'.repeat(64),
      copyCount: 1,
      upvoteCount: 100,
      createdAt: sameAge,
    })
    // Recency still applies to the copy score: a recent low-copy config beats an old high-copy one.
    await seedPublished({
      slug: 'trend-old-copies',
      title: 'OldCopies',
      sha: '9'.repeat(64),
      copyCount: 100,
      createdAt: new Date(Date.now() - 30 * msPerDay),
    })
    await seedPublished({
      slug: 'trend-new-fewcopies',
      title: 'NewFewCopies',
      sha: 'cc'.repeat(32),
      copyCount: 5,
      createdAt: new Date(Date.now() - 1 * msPerHour),
    })

    const order = (await getPublishedConfigs(db, 'trending')).map((c) => c.slug)
    // Copies beat upvotes at equal age.
    expect(order.indexOf('trend-copies')).toBeLessThan(order.indexOf('trend-votes'))
    // Recency still applies to the copy score.
    expect(order.indexOf('trend-new-fewcopies')).toBeLessThan(order.indexOf('trend-old-copies'))
  })

  it('trending: zero-copy ties break newest-first (the default view must be deterministic)', async () => {
    await seedPublished({
      slug: 'trend-tie-old',
      title: 'TieOld',
      sha: 'da'.repeat(32),
      copyCount: 0,
      createdAt: new Date(Date.now() - 3 * msPerHour),
    })
    await seedPublished({
      slug: 'trend-tie-new',
      title: 'TieNew',
      sha: 'db'.repeat(32),
      copyCount: 0,
      createdAt: new Date(Date.now() - 1 * msPerHour),
    })

    const order = (await getPublishedConfigs(db, 'trending')).map((c) => c.slug)
    // Both must be on page 1: indexOf returning -1 would make the comparison pass vacuously,
    // which is exactly how a broken tiebreak would slip through.
    expect(order).toContain('trend-tie-new')
    expect(order).toContain('trend-tie-old')
    expect(order.indexOf('trend-tie-new')).toBeLessThan(order.indexOf('trend-tie-old'))
  })

  it('upvoteCount is populated on GalleryCard', async () => {
    await seedPublished({
      slug: 'count-check',
      title: 'CountCheck',
      // Unique sha: storePreviews deletes-then-inserts by sha, so reusing another config's sha
      // (this was '9'.repeat(64), shared with trend-old-copies) silently wipes its preview.
      sha: 'f'.repeat(64),
      upvoteCount: 7,
    })

    const cards = await getPublishedConfigs(db, 'top')
    const card = cards.find((c) => c.slug === 'count-check')
    expect(card).toBeDefined()
    expect(card?.upvoteCount).toBe(7)
  })

  it('author and copyCount are populated on GalleryCard', async () => {
    await seedPublished({
      slug: 'author-check',
      title: 'AuthorCheck',
      sha: 'aa'.repeat(32),
      copyCount: 9,
    })

    const cards = await getPublishedConfigs(db, 'new')
    const card = cards.find((c) => c.slug === 'author-check')
    expect(card).toBeDefined()
    expect(card?.copyCount).toBe(9)
    expect(card?.author).toEqual({
      name: 'Author One',
      username: 'authorone',
      image: 'https://example.com/avatar.png',
    })
  })
})

// Placed last on purpose: this seeds extra configs, and the tests above share one accumulating
// PGlite db, so seeding earlier would push their fixtures off page 1.
describe('getPublishedConfigs query count', () => {
  it('issues a constant number of queries regardless of card count (no N+1)', async () => {
    // A page of N cards must not fan out into 1 + N queries (one preview lookup per card).
    // Build a second Drizzle over the SAME PGlite client with a counting logger, so only the
    // getPublishedConfigs call below is measured (the seeding above uses the unlogged `db`).
    for (let i = 0; i < 4; i++) {
      await seedPublished({
        slug: `qcount-${i}`,
        title: `QCount${i}`,
        sha: `e${i}`.padEnd(64, '0'),
      })
    }
    let queryCount = 0
    const countedDb = drizzle({
      client,
      schema,
      logger: {
        logQuery: () => {
          queryCount++
        },
      },
    })

    const cards = await getPublishedConfigs(countedDb)

    // The page must be non-trivially full for "no N+1" to be a meaningful assertion.
    expect(cards.length).toBeGreaterThan(2)
    // One list query + one batched preview query = 2. The N+1 version issues 1 + cards.length.
    expect(queryCount).toBeLessThanOrEqual(2)
  })
})
