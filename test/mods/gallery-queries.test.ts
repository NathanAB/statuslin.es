import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getConfigSource } from '@/gallery/config-items'
import { type GalleryItem, mergeGalleryItems } from '@/gallery/gallery-items'
import { getModSource } from '@/mods/gallery-queries'
import { addPublishedConfig } from '../gallery/seed-configs'
import {
  addDesktopPreview,
  addMod,
  addVersion,
  openTestDb,
  SEEDED_DESKTOP_SHOT,
  setCurrentVersion,
  sha,
  type TestDb,
} from './seed-mods'

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

const HOUR_MS = 60 * 60 * 1000

async function publishedMod(
  slug: string,
  opts: {
    status?: schema.ModStatus
    allTags?: string[]
    terminal?: boolean
    desktop?: 'shot' | 'nothing'
  } = {},
): Promise<string> {
  const modId = await addMod(db, slug, opts.status ?? 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    rendered: opts.terminal ?? true,
    repoUrl: `https://github.com/octocat/${slug}`,
  })
  await setCurrentVersion(db, modId, versionId)
  if (opts.desktop) await addDesktopPreview(db, versionId, opts.desktop)
  if (opts.allTags) {
    await db.update(schema.mods).set({ allTags: opts.allTags }).where(eq(schema.mods.id, modId))
  }
  return modId
}

const slugs = (items: GalleryItem[]) => items.map((item) => `${item.kind}:${item.card.slug}`)

describe('getModSource', () => {
  it('lists only published mods', async () => {
    await publishedMod('live')
    await publishedMod('drafted', { status: 'draft' })
    await publishedMod('pulled', { status: 'removed' })

    const source = await getModSource(db, { sort: 'new' })

    expect(slugs(source.items.map((ranked) => ranked.item))).toEqual(['mod:live'])
    expect(source.total).toBe(1)
  })

  it('carries the clean-main terminal preview and Desktop shot, and no shot for nothing', async () => {
    await publishedMod('terminal')
    const desktopId = await publishedMod('desktop', { terminal: false, desktop: 'shot' })
    await publishedMod('blank-desktop', { desktop: 'nothing' })

    const cards = new Map(
      (await getModSource(db, { sort: 'new' })).items.map(({ item }) => [item.card.slug, item]),
    )

    expect(cards.get('terminal')).toMatchObject({
      kind: 'mod',
      card: { preview: [{ text: 'meter' }], desktopShot: null, authorGithub: 'octocat' },
    })
    const [version] = await db
      .select({ id: schema.modVersions.id })
      .from(schema.modVersions)
      .where(eq(schema.modVersions.modId, desktopId))
    expect(cards.get('desktop')).toMatchObject({
      card: {
        preview: null,
        desktopShot: {
          src: expect.stringMatching(
            new RegExp(`^/mod-previews/${version?.id}/desktop\\.png\\?r=\\d+$`),
          ),
          width: SEEDED_DESKTOP_SHOT.width,
          height: SEEDED_DESKTOP_SHOT.height,
          cardAnchor: SEEDED_DESKTOP_SHOT.cardAnchor,
        },
      },
    })
    expect(cards.get('blank-desktop')).toMatchObject({ card: { desktopShot: null } })
  })

  it('carries no terminal preview for a mod that draws nothing in the terminal', async () => {
    const modId = await publishedMod('blank')
    await db.update(schema.modPreviews).set({ segments: [] })

    const [ranked] = (await getModSource(db, { sort: 'new' })).items

    expect(ranked?.item).toMatchObject({ card: { modId, preview: null } })
  })

  it('lists a mod for a tag only when the mod carries that tag', async () => {
    await publishedMod('tagged', { allTags: ['git', 'cost'] })
    await publishedMod('untagged', { allTags: ['cost'] })

    const source = await getModSource(db, { sort: 'top', tags: ['git'] })

    expect(slugs(source.items.map((ranked) => ranked.item))).toEqual(['mod:tagged'])
    expect(source.total).toBe(1)
  })

  it('stops at the limit but still counts every match', async () => {
    await publishedMod('one')
    await publishedMod('two')
    await publishedMod('three')

    const source = await getModSource(db, { sort: 'new', limit: 2 })

    expect(source.items).toHaveLength(2)
    expect(source.total).toBe(3)
  })
})

describe('trending across kinds', () => {
  it('weighs a mod copy the same as a config copy of the same age', async () => {
    const now = Date.now()
    const modId = await publishedMod('mod-copied-now')
    const configId = await addPublishedConfig(db, 'config-copied-now')
    await db.insert(schema.modCopyEvents).values({ modId, ipHash: 'a', createdAt: new Date(now) })
    await db.insert(schema.copyEvents).values({ configId, ipHash: 'a', createdAt: new Date(now) })

    const [mods, configs] = await Promise.all([
      getModSource(db, { sort: 'trending' }),
      getConfigSource(db, { sort: 'trending' }),
    ])

    expect(mods.items[0]?.sortKey).toBeGreaterThan(0)
    expect(mods.items[0]?.sortKey).toBeCloseTo(configs.items[0]?.sortKey ?? 0, 3)
  })

  it('ranks a recently copied mod above a config copied a week ago', async () => {
    const now = Date.now()
    const modId = await publishedMod('fresh-mod')
    const configId = await addPublishedConfig(db, 'stale-config')
    await publishedMod('never-copied')
    await db
      .insert(schema.modCopyEvents)
      .values({ modId, ipHash: 'a', createdAt: new Date(now - HOUR_MS) })
    await db
      .insert(schema.copyEvents)
      .values({ configId, ipHash: 'a', createdAt: new Date(now - 7 * 24 * HOUR_MS) })

    const merged = mergeGalleryItems([
      (await getConfigSource(db, { sort: 'trending' })).items,
      (await getModSource(db, { sort: 'trending' })).items,
    ])

    expect(slugs(merged)).toEqual(['mod:fresh-mod', 'status-line:stale-config', 'mod:never-copied'])
  })
})
