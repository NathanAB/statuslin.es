import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { GalleryItem } from '@/gallery/gallery-items'
import { getModRelated } from '@/mods/related'
import { addPublishedConfig } from '../gallery/seed-configs'
import { addMod, addVersion, openTestDb, setCurrentVersion, sha, type TestDb } from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
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
  opts: { status?: 'removed'; copyCount?: number } = {},
) {
  const configId = await addPublishedConfig(db, slug, { allTags })
  await db
    .update(schema.configs)
    .set({ status: opts.status ?? 'published', copyCount: opts.copyCount ?? 0 })
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

  it('stops at four of each, mods first, the most copied ahead on a tie', async () => {
    await mod('viewed', VIEWED.tags)
    for (const n of [1, 2, 3, 4, 5]) {
      await mod(`mod-${n}`, ['cost'], { copyCount: n })
      await statusLine(`line-${n}`, ['cost'], { copyCount: n })
    }

    expect(await related()).toEqual([
      'mod:mod-5',
      'mod:mod-4',
      'mod:mod-3',
      'mod:mod-2',
      'status-line:line-5',
      'status-line:line-4',
      'status-line:line-3',
      'status-line:line-2',
    ])
  })

  it('relates nothing to a mod without tags', async () => {
    await mod('viewed', [])
    await mod('other', [])
    await statusLine('line', [])

    expect(await related({ slug: 'viewed', tags: [] })).toEqual([])
  })
})
