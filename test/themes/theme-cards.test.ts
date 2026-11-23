import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPublishedModThemes, getThemeCards } from '@/themes/queries'
import {
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  SEEDED_THEME_PREVIEW,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

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
})

/** A plugin whose current version is its only one, carrying these theme names. */
async function plugin(
  slug: string,
  names: string[],
  opts: {
    status?: schema.ModStatus
    copyCount?: number
    footprint?: schema.ModFootprint
    hooksModules?: string[]
  } = {},
) {
  const { status, copyCount, ...version } = opts
  const modId = await addMod(db, slug, status ?? 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    ...version,
  })
  await setCurrentVersion(db, modId, versionId)
  await db
    .update(schema.mods)
    .set({ title: `${slug} title`, copyCount: copyCount ?? 0 })
    .where(eq(schema.mods.id, modId))
  for (const name of names) {
    await addTheme(db, versionId, { key: name.toLowerCase().replace(/ /g, '-'), name })
  }
  return { modId, versionId }
}

const named = (cards: { name: string; plugin: { slug: string } }[]) =>
  cards.map((card) => `${card.plugin.slug}:${card.name}`)

describe('getThemeCards', () => {
  it('gives one card per theme, with its preview, window and plugin, so a pack of 81 shows 81', async () => {
    const names = Array.from({ length: 81 }, (_, i) => `Theme ${String(i).padStart(2, '0')}`)
    await plugin('pack', names)

    const cards = await getThemeCards(db)

    expect(cards).toHaveLength(81)
    expect(cards[0]).toEqual({
      id: expect.any(String),
      name: 'Theme 00',
      window: 'dark',
      preview: SEEDED_THEME_PREVIEW.segments,
      plugin: { slug: 'pack', title: 'pack title', authorGithub: 'octocat', code: null },
    })
  })

  it("carries what a plugin's hooks modules can reach on its theme cards, so they can say it runs code", async () => {
    const footprint = { events: ['ui.render{component=AbovePrompt}'], calls: ['$.http.fetch'] }
    await plugin('mixed', ['Night'], { footprint, hooksModules: ['./register.ts'] })
    // A module validate records nothing for is still code.
    await plugin('silent', ['Dawn'], { hooksModules: ['./register.ts'] })

    const cards = await getThemeCards(db)

    expect(cards.map((card) => [card.name, card.plugin.code])).toEqual([
      ['Night', { footprint }],
      ['Dawn', { footprint: { events: [], calls: [] } }],
    ])
  })

  it("orders plugins by installs, then slug, and each plugin's themes by name", async () => {
    await plugin('quiet', ['Zed', 'alpha'])
    await plugin('popular', ['Night', 'Dawn'], { copyCount: 9 })
    await plugin('also-quiet', ['Mid'])

    expect(named(await getThemeCards(db))).toEqual([
      'popular:Dawn',
      'popular:Night',
      'also-quiet:Mid',
      'quiet:alpha',
      'quiet:Zed',
    ])
  })

  it('lists only published plugins', async () => {
    await plugin('live', ['Paper'])
    await plugin('draft', ['Ink'], { status: 'draft' })
    await plugin('gone', ['Ash'], { status: 'removed' })

    expect(named(await getThemeCards(db))).toEqual(['live:Paper'])
  })

  it("lists the live version's themes, never a newer or older version's", async () => {
    const { modId, versionId } = await plugin('pack', ['Live'])
    const newer = await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
    await addTheme(db, newer, { key: 'next', name: 'Next' })
    const older = await addVersion(db, modId, { commitSha: sha('c'), versionNumber: 0 })
    await addTheme(db, older, { key: 'old', name: 'Old' })
    await setCurrentVersion(db, modId, versionId)

    expect(named(await getThemeCards(db))).toEqual(['pack:Live'])
  })

  it('leaves out a theme with no preview', async () => {
    const { versionId } = await plugin('pack', ['Paper'])
    await addTheme(db, versionId, { key: 'ink', name: 'Ink', rendered: false })

    expect(named(await getThemeCards(db))).toEqual(['pack:Paper'])
  })
})

describe('getPublishedModThemes', () => {
  it("lists one published plugin's themes by name", async () => {
    await plugin('pack', ['Night', 'Dawn'])
    await plugin('other', ['Paper'])
    await plugin('draft', ['Ink'], { status: 'draft' })

    expect(named(await getPublishedModThemes(db, 'pack'))).toEqual(['pack:Dawn', 'pack:Night'])
    expect(await getPublishedModThemes(db, 'draft')).toEqual([])
  })
})
