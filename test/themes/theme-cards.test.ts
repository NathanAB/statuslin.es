import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { themeDesktopPreviewPath } from '@/lib/site'
import { getPublishedModThemes, getThemeCards } from '@/themes/queries'
import {
  addDesktopTheme,
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  SEEDED_THEME_PREVIEW,
  SEEDED_THEME_SHOT,
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
      kind: 'terminal',
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

describe('getThemeCards for Desktop themes', () => {
  const THEME_FOOTPRINT = { events: ['session.start'], calls: ['$.theme.set'] }

  async function themeMod(slug: string) {
    return plugin(slug, [], { footprint: THEME_FOOTPRINT, hooksModules: ['./register.tsx'] })
  }

  const renderedAt = async (themeId: string) => {
    const [row] = await db
      .select({ createdAt: schema.modThemeDesktopPreviews.createdAt })
      .from(schema.modThemeDesktopPreviews)
      .where(eq(schema.modThemeDesktopPreviews.themeId, themeId))
    return row?.createdAt as Date
  }

  it('gives a Desktop theme its shot and card image by URL, and the steps that switch to it', async () => {
    const { versionId } = await themeMod('theme-examples')
    const id = await addDesktopTheme(db, versionId, {
      key: 'honu-lagoon',
      name: 'Honu Lagoon',
      window: 'light',
      switchSteps: ['/custom-theme honu-lagoon'],
    })
    const at = await renderedAt(id)

    expect(await getThemeCards(db)).toEqual([
      {
        id,
        kind: 'desktop',
        name: 'Honu Lagoon',
        window: 'light',
        preview: {
          shot: {
            src: themeDesktopPreviewPath(id, at),
            width: SEEDED_THEME_SHOT.width,
            height: SEEDED_THEME_SHOT.height,
          },
          card: {
            src: themeDesktopPreviewPath(id, at, 'card'),
            width: SEEDED_THEME_SHOT.cardWidth,
            height: SEEDED_THEME_SHOT.cardHeight,
          },
        },
        switchSteps: ['/custom-theme honu-lagoon'],
        plugin: {
          slug: 'theme-examples',
          title: 'theme-examples title',
          authorGithub: 'octocat',
          code: { footprint: THEME_FOOTPRINT },
        },
      },
    ])
  })

  it("lists Desktop and terminal themes together, each plugin's by name", async () => {
    const { versionId } = await themeMod('mixed')
    await addDesktopTheme(db, versionId, { key: 'night-reef', name: 'Night Reef' })
    await addTheme(db, versionId, { key: 'dawn', name: 'Dawn' })

    const cards = await getThemeCards(db)
    expect(cards.map((card) => [card.kind, card.name])).toEqual([
      ['terminal', 'Dawn'],
      ['desktop', 'Night Reef'],
    ])
  })

  it('leaves out a Desktop theme with no shot, and a terminal preview does not count as one', async () => {
    const { versionId } = await themeMod('pack')
    await addDesktopTheme(db, versionId, { key: 'night-reef', name: 'Night Reef' })
    const honu = await addDesktopTheme(db, versionId, {
      key: 'honu',
      name: 'Honu',
      rendered: false,
    })
    await db.insert(schema.modThemePreviews).values({ themeId: honu, ...SEEDED_THEME_PREVIEW })

    expect(named(await getThemeCards(db))).toEqual(['pack:Night Reef'])
  })

  it("lists a published plugin's Desktop themes on its page", async () => {
    const { versionId } = await themeMod('pack')
    await addDesktopTheme(db, versionId, { key: 'rainy', name: 'Rainy Window', switchSteps: [] })

    const [theme] = await getPublishedModThemes(db, 'pack')
    expect(theme?.kind === 'desktop' && theme.switchSteps).toEqual([])
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
