import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { HERO_SIZE } from '@/gallery/hero-lines'
import { getHeroMods, getModSource } from '@/mods/gallery-queries'
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

const FOOTPRINT = { events: ['$.http.fetch'], calls: [] }

async function addPublished(slug: string, copies: number, extra: { shot?: boolean } = {}) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha(slug.slice(-1)),
    versionNumber: 1,
    footprint: FOOTPRINT,
  })
  if (extra.shot) await addDesktopPreview(db, versionId, 'shot')
  await setCurrentVersion(db, modId, versionId)
  for (let i = 0; i < copies; i++) {
    await db.insert(schema.modCopyEvents).values({ modId, ipHash: `${slug}-${i}` })
  }
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  // Ten published mods, copied different amounts, so Trending has an order of its own.
  for (let i = 0; i < 10; i++) await addPublished(`mod-${i}`, (i * 7) % 10, { shot: i === 7 })
  await addMod(db, 'drafted', 'draft')
})
afterAll(async () => {
  await close()
})

// The home hero ranks mods among status lines on one Trending scale, as its gallery does.
describe('getHeroMods', () => {
  it('takes the first eight mods in the order the home gallery ranks them', async () => {
    const gallery = await getModSource(db, { sort: 'trending' })
    const expected = gallery.items.slice(0, HERO_SIZE).map(({ item }) => item.card.slug)

    const mods = await getHeroMods(db)

    expect(mods.map((mod) => mod.slug)).toEqual(expected)
    expect(mods.map((mod) => mod.slug)).not.toContain('drafted')
    const keys = mods.map((mod) => mod.sortKey ?? 0)
    expect(keys).toEqual([...keys].sort((a, b) => b - a))
  })

  // The whole shot, not the card: a card can hold Desktop's prompt box or not, and the whole shot
  // always runs down through it, so the hero draws no second one.
  it('carries what the hero shows: its terminal render, whole Desktop shot, footprint and author', async () => {
    const mods = await getHeroMods(db)
    const shot = mods.find((mod) => mod.slug === 'mod-7')

    expect(shot).toMatchObject({
      title: 'mod-7',
      authorGithub: 'octocat',
      copyCount: expect.any(Number),
      render: [{ text: 'meter' }],
      footprint: FOOTPRINT,
      desktop: {
        src: expect.stringMatching(/\/desktop\.png\?r=\d+$/),
        width: SEEDED_DESKTOP_SHOT.width,
        height: SEEDED_DESKTOP_SHOT.height,
      },
    })
    expect(shot?.modId).toEqual(expect.any(String))
    expect(mods.find((mod) => mod.slug === 'mod-1')?.desktop).toBeNull()
  })
})
