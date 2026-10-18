import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import type { GalleryItem } from '@/gallery/gallery-items'
import { getModRelated, getStatusLineMods, MOD_RELATED_LIMIT } from '@/mods/related'
import { addPublishedConfig } from '../gallery/seed-configs'
import { addMod, addVersion, openTestDb, setCurrentVersion, sha, type TestDb } from './seed-mods'

let db: TestDb
let client: PGlite
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, client, close } = await openTestDb())
})
afterAll(async () => {
  await close()
})
beforeEach(async () => {
  await db.delete(schema.mods)
  await db.delete(schema.configs)
})

async function mod(
  slug: string,
  allTags: string[],
  opts: { status?: schema.ModStatus; copyCount?: number } = {},
) {
  const modId = await addMod(db, slug, opts.status ?? 'published')
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1 })
  await setCurrentVersion(db, modId, versionId)
  await db
    .update(schema.mods)
    .set({ allTags, copyCount: opts.copyCount ?? 0 })
    .where(eq(schema.mods.id, modId))
}

async function statusLine(
  slug: string,
  allTags: string[],
  opts: { status?: 'removed'; copyCount?: number; createdAt?: Date } = {},
) {
  const configId = await addPublishedConfig(db, slug, { allTags })
  await db
    .update(schema.configs)
    .set({
      status: opts.status ?? 'published',
      copyCount: opts.copyCount ?? 0,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .where(eq(schema.configs.id, configId))
}

const VIEWED = { slug: 'viewed', tags: ['cost', 'quota'] }
const related = async (viewed = VIEWED) =>
  (await getModRelated(db, viewed)).map((item: GalleryItem) => `${item.kind}:${item.card.slug}`)

describe('getModRelated', () => {
  it('lists other published mods that share a tag, most shared tags first', async () => {
    await mod('viewed', VIEWED.tags)
    await mod('one-tag', ['quota'], { copyCount: 9 })
    await mod('both-tags', ['cost', 'quota'])
    await mod('no-tag', ['git'], { copyCount: 50 })
    await mod('draft', ['cost'], { status: 'draft' })
    await mod('removed', ['cost'], { status: 'removed' })

    expect(await related()).toEqual(['mod:both-tags', 'mod:one-tag'])
  })

  it('lists published status lines carrying one of its tags, most shared tags first', async () => {
    await mod('viewed', VIEWED.tags)
    await statusLine('one-tag', ['cost', 'bash'], { copyCount: 9 })
    await statusLine('both-tags', ['quota', 'cost'])
    await statusLine('no-tag', ['git'], { copyCount: 50 })
    await statusLine('removed', ['cost'], { status: 'removed' })

    expect(await related()).toEqual(['status-line:both-tags', 'status-line:one-tag'])
  })

  it('reads only the top four of each from the database: most shared tags, most copied, then newest', async () => {
    await mod('viewed', VIEWED.tags)
    await mod('mod-one-tag', ['cost'], { copyCount: 100 })
    await mod('mod-a', VIEWED.tags, { copyCount: 5 })
    await mod('mod-c', VIEWED.tags, { copyCount: 3 })
    await mod('mod-b', VIEWED.tags, { copyCount: 3 })
    await mod('mod-d', VIEWED.tags, { copyCount: 1 })
    await mod('mod-e', VIEWED.tags)
    await statusLine('line-one-tag', ['cost'], { copyCount: 100 })
    await statusLine('line-a', VIEWED.tags, { copyCount: 5 })
    await statusLine('line-old', VIEWED.tags, { copyCount: 3, createdAt: new Date('2025-01-01') })
    await statusLine('line-new', VIEWED.tags, { copyCount: 3, createdAt: new Date('2026-01-01') })
    await statusLine('line-d', VIEWED.tags, { copyCount: 1 })
    await statusLine('line-e', VIEWED.tags)

    const query = vi.spyOn(client, 'query')
    try {
      expect(await related()).toEqual([
        'mod:mod-a',
        'mod:mod-b',
        'mod:mod-c',
        'mod:mod-d',
        'status-line:line-a',
        'status-line:line-new',
        'status-line:line-old',
        'status-line:line-d',
      ])
      const results = await Promise.all(query.mock.results.map((result) => result.value))
      const rowCounts = results.map((result: { rows: unknown[] }) => result.rows.length)
      expect(Math.max(...rowCounts)).toBeLessThanOrEqual(MOD_RELATED_LIMIT)
    } finally {
      query.mockRestore()
    }
  })

  it('relates nothing to a mod without tags', async () => {
    await mod('viewed', [])
    await mod('other', [])
    await statusLine('line', [])

    expect(await related({ slug: 'viewed', tags: [] })).toEqual([])
  })
})

describe('getStatusLineMods', () => {
  const statusLineMods = async (tags: string[]) =>
    (await getStatusLineMods(db, { tags })).map((card) => card.slug)

  it('lists published mods sharing a tag with the status line, most shared tags first', async () => {
    await mod('one-tag', ['quota'], { copyCount: 9 })
    await mod('both-tags', ['cost', 'quota'])
    await mod('no-tag', ['git'], { copyCount: 50 })
    await mod('draft', ['cost'], { status: 'draft' })
    await mod('removed', ['cost'], { status: 'removed' })
    await statusLine('line', ['cost', 'quota'])

    expect(await statusLineMods(['cost', 'quota'])).toEqual(['both-tags', 'one-tag'])
  })

  it('stops at four, the most copied ahead on a tie', async () => {
    for (const n of [1, 2, 3, 4, 5]) await mod(`mod-${n}`, ['cost'], { copyCount: n })

    expect(await statusLineMods(['cost'])).toEqual(['mod-5', 'mod-4', 'mod-3', 'mod-2'])
  })

  it('lists nothing for a status line without tags', async () => {
    await mod('untagged', [])
    await mod('tagged', ['cost'])

    expect(await statusLineMods([])).toEqual([])
  })
})
