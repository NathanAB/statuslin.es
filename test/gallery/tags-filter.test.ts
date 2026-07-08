import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getAvailableTags } from '@/gallery/facet-queries'
import { getPublishedConfigs, getPublishedCount } from '@/gallery/queries'
import { storePreviews } from '@/render/store'

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
      name: 'Author One',
      username: 'authorone',
      email: 'author1@test.com',
      image: 'https://example.com/avatar.png',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()

  async function seedPublished(slug: string, title: string, sha: string, allTags: string[]) {
    const cfgRows = await db
      .insert(schema.configs)
      .values({
        slug,
        title,
        description: 'desc',
        authorId: 'u1',
        interpreter: 'bash',
        status: 'published',
        allTags,
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
        contentSha256: sha,
        status: 'approved',
      })
      .returning()
    const ver = verRows[0]!
    await db
      .update(schema.configs)
      .set({ currentVersionId: ver.id })
      .where(eq(schema.configs.id, cfg.id))
    await storePreviews(db, sha, [
      {
        scenarioKey: 'clean-main',
        segments: [
          { text: title, fg: null, bg: null, bold: false, italic: false, underline: false },
        ],
        rawStdout: title,
        exitCode: 0,
        timedOut: false,
        trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
      },
    ])
  }

  await seedPublished('a', 'A', 'a'.repeat(64), ['node', 'quota'])
  await seedPublished('b', 'B', 'b'.repeat(64), ['python', 'quota'])
  await seedPublished('c', 'C', 'c'.repeat(64), ['node'])
})

afterAll(async () => {
  await client.close()
})

describe('getPublishedConfigs tag filter (flat AND)', () => {
  it('no tags → all published', async () => {
    expect((await getPublishedConfigs(db, 'new', 1, [])).length).toBe(3)
  })
  it('single tag matches any config carrying it', async () => {
    const slugs = (await getPublishedConfigs(db, 'new', 1, ['node'])).map((c) => c.slug)
    expect(new Set(slugs)).toEqual(new Set(['a', 'c']))
  })
  it('multiple tags AND together', async () => {
    const slugs = (await getPublishedConfigs(db, 'new', 1, ['node', 'quota'])).map((c) => c.slug)
    expect(slugs).toEqual(['a'])
  })
  it('contradictory tags return empty', async () => {
    expect(await getPublishedConfigs(db, 'new', 1, ['node', 'python'])).toEqual([])
  })
})

describe('getPublishedCount tag filter (drives page count)', () => {
  it('no tags → counts all published', async () => {
    expect(await getPublishedCount(db)).toBe(3)
  })
  it('filters the count by the same tags as the cards', async () => {
    expect(await getPublishedCount(db, ['node'])).toBe(2)
    expect(await getPublishedCount(db, ['node', 'quota'])).toBe(1)
  })
  it('a tag no config carries counts zero', async () => {
    expect(await getPublishedCount(db, ['themed'])).toBe(0)
  })
})

describe('getAvailableTags (drives the filter dropdown)', () => {
  it('returns only slugs a published config carries, in registry order', async () => {
    // seed carries node, quota, python; registry order puts quota before python before node.
    expect(await getAvailableTags(db)).toEqual(['quota', 'python', 'node'])
  })
})
