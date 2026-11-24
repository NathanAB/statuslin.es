import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { themeDesktopPreviewPath } from '@/lib/site'
import {
  getHomeThemes,
  getPalettePages,
  getPaletteThemes,
  getPublishedModThemes,
  getThemeCards,
  getUnreviewedThemeCards,
  homeThemesOrEmpty,
} from '@/themes/queries'
import {
  addDesktopTheme,
  addMod,
  addShownDraft,
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
    const { modId } = await plugin('pack', names)

    const cards = await getThemeCards(db)

    expect(cards).toHaveLength(81)
    expect(cards[0]).toEqual({
      id: expect.any(String),
      key: 'theme-00',
      kind: 'terminal',
      name: 'Theme 00',
      window: 'dark',
      usesTerminalColors: false,
      preview: SEEDED_THEME_PREVIEW.segments,
      plugin: { id: modId, slug: 'pack', title: 'pack title', authorGithub: 'octocat', code: null },
    })
  })

  it('says on each terminal card whether its theme uses the terminal palette, as intake stored it', async () => {
    const { versionId } = await plugin('pack', ['Gruvbox Light'])
    await addTheme(db, versionId, { key: 'dawn', name: 'Dawn (ANSI)', usesTerminalColors: true })

    const cards = await getThemeCards(db)

    expect(
      cards.map((card) => [card.name, card.kind === 'terminal' && card.usesTerminalColors]),
    ).toEqual([
      ['Dawn (ANSI)', true],
      ['Gruvbox Light', false],
    ])
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
    const { modId, versionId } = await themeMod('theme-examples')
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
        key: 'honu-lagoon',
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
          id: modId,
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

describe('getHomeThemes', () => {
  // Plugins take turns in /themes order (most installs, then slug), each giving its themes in name
  // order, so a row of three shows three plugins' looks before a second from any one.
  it('takes turns across plugins in /themes order, and counts every listed theme', async () => {
    await plugin('quiet', ['Zed', 'alpha'])
    await plugin('popular', ['Night', 'Dawn', 'Ash'], { copyCount: 9 })
    await plugin('also-quiet', ['Mid'])

    const { themes, total } = await getHomeThemes(db, 3)

    expect(named(themes)).toEqual(['popular:Ash', 'also-quiet:Mid', 'quiet:alpha'])
    expect(total).toBe(6)
  })

  it("goes round again when there are fewer plugins than cards, with each card's preview", async () => {
    await plugin('popular', ['Night', 'Dawn'], { copyCount: 9 })
    await plugin('quiet', ['Zed'])

    const { themes, total } = await getHomeThemes(db, 3)

    expect(named(themes)).toEqual(['popular:Dawn', 'quiet:Zed', 'popular:Night'])
    expect(themes[0]?.preview).toEqual(SEEDED_THEME_PREVIEW.segments)
    expect(total).toBe(3)
  })

  it('shows and counts only themes /themes lists', async () => {
    const { versionId } = await plugin('live', ['Paper'])
    await addTheme(db, versionId, { key: 'ink', name: 'Ink', rendered: false })
    await plugin('draft', ['Ash'], { status: 'draft' })

    expect(await getHomeThemes(db, 3)).toEqual({
      themes: [expect.objectContaining({ name: 'Paper' })],
      total: 1,
    })
  })

  it('shows none when no theme is listed', async () => {
    expect(await getHomeThemes(db, 3)).toEqual({ themes: [], total: 0 })
  })
})

// The row sits under the gallery, the page's content; it must not turn the home page into an error.
describe('homeThemesOrEmpty', () => {
  it('reports a failure and leaves the row empty', async () => {
    const report = vi.fn()
    const failure = new Error('themes query failed')
    expect(await homeThemesOrEmpty(() => Promise.reject(failure), report)).toEqual({
      themes: [],
      total: 0,
    })
    expect(report).toHaveBeenCalledWith(failure)
  })

  it('passes a loaded row through', async () => {
    const report = vi.fn()
    expect(await homeThemesOrEmpty(async () => ({ themes: [], total: 4 }), report)).toEqual({
      themes: [],
      total: 4,
    })
    expect(report).not.toHaveBeenCalled()
  })
})

describe('getPaletteThemes', () => {
  it("gives a palette's published themes from every plugin, in /themes' order, with every palette that has a page", async () => {
    await plugin('looks', ['Catppuccin Latte', 'Nord Snow'])
    await plugin('catppuccin', ['Catppuccin Mocha', 'Catppuccin Macchiato', 'Ember'], {
      copyCount: 5,
    })

    const page = await getPaletteThemes(db, 'catppuccin')

    expect(page?.palette.name).toBe('Catppuccin')
    expect(named(page?.themes ?? [])).toEqual([
      'catppuccin:Catppuccin Macchiato',
      'catppuccin:Catppuccin Mocha',
      'looks:Catppuccin Latte',
    ])
    expect(page?.palettes.map((palette) => palette.slug)).toEqual(['catppuccin', 'nord'])
  })

  it('never lists a theme whose plugin is not published', async () => {
    await plugin('live', ['Dracula'])
    await plugin('draft', ['Dracula Pro'], { status: 'draft' })
    await plugin('gone', ['Alucard'], { status: 'removed' })

    expect(named((await getPaletteThemes(db, 'dracula'))?.themes ?? [])).toEqual(['live:Dracula'])
  })

  it('has no page for a palette with no published theme, or a slug that names no palette', async () => {
    await plugin('draft', ['Solarized Dark'], { status: 'draft' })
    await plugin('ember', ['Ember'])

    expect(await getPaletteThemes(db, 'solarized')).toBeNull()
    expect(await getPaletteThemes(db, 'ember')).toBeNull()
  })
})

describe('getPalettePages', () => {
  it('dates each palette page by its newest published theme going live, and lists no other palette', async () => {
    const old = await plugin('old', ['Nord'])
    const recent = await plugin('recent', ['Nord Snow'])
    await plugin('draft', ['Gruvbox Dark'], { status: 'draft' })
    await db
      .update(schema.modVersions)
      .set({ createdAt: new Date('2026-10-01T00:00:00Z') })
      .where(eq(schema.modVersions.id, old.versionId))
    await db
      .update(schema.modVersions)
      .set({ createdAt: new Date('2026-11-02T00:00:00Z') })
      .where(eq(schema.modVersions.id, recent.versionId))

    const pages = await getPalettePages(db)

    expect(pages.map(({ palette, updatedAt }) => [palette.slug, updatedAt.toISOString()])).toEqual([
      ['nord', '2026-11-02T00:00:00.000Z'],
    ])
  })
})

// Curated Desktop theme packs shown as unreviewed mods (ADR 0014): cards with no install.
describe('getUnreviewedThemeCards', () => {
  async function pack(
    pluginName: string,
    owner: string,
    themes: { key: string; name: string }[],
    shown = true,
  ) {
    const seeded = await addShownDraft(db, {
      slug: `${pluginName}-slug`,
      pluginName,
      repoUrl: `https://github.com/${owner}/${pluginName}`,
      shown,
    })
    const ids: string[] = []
    for (const theme of themes) ids.push(await addDesktopTheme(db, seeded.versionId, theme))
    return { ...seeded, ids }
  }

  it("gives a shown draft's Desktop theme its preview and its mod's address, with no plugin or switch steps", async () => {
    const {
      ids: [id],
    } = await pack('looks', 'Ada', [{ key: 'night-reef', name: 'Night Reef' }])
    const [row] = await db
      .select({ at: schema.modThemeDesktopPreviews.createdAt })
      .from(schema.modThemeDesktopPreviews)
      .where(eq(schema.modThemeDesktopPreviews.themeId, id as string))
    const at = row?.at as Date

    expect(await getUnreviewedThemeCards(db)).toEqual([
      {
        id,
        key: 'night-reef',
        kind: 'desktop',
        name: 'Night Reef',
        window: 'dark',
        preview: {
          shot: { src: themeDesktopPreviewPath(id as string, at), width: 1100, height: 900 },
          card: {
            src: themeDesktopPreviewPath(id as string, at, 'card'),
            width: 440,
            height: 360,
          },
        },
        mod: { owner: 'Ada', pluginName: 'looks' },
      },
    ])
  })

  it('lists only shown drafts, by mod name then theme name, and never a published or unshown one', async () => {
    await pack('zest', 'Bo', [{ key: 'b', name: 'Lime' }])
    await pack('looks', 'Ada', [
      { key: 'z', name: 'Zinc' },
      { key: 'a', name: 'Amber' },
    ])
    await pack('hidden', 'Ada', [{ key: 'h', name: 'Hidden' }], false)
    await plugin('live', ['Paper'])

    expect(
      (await getUnreviewedThemeCards(db)).map((card) => `${card.mod.pluginName}:${card.name}`),
    ).toEqual(['looks:Amber', 'looks:Zinc', 'zest:Lime'])
  })

  it("gives one mod's themes by its address, whatever the owner's case", async () => {
    await pack('looks', 'Ada', [{ key: 'a', name: 'Amber' }])
    await pack('zest', 'Bo', [{ key: 'b', name: 'Lime' }])

    expect(
      (await getUnreviewedThemeCards(db, { owner: 'ada', pluginName: 'looks' })).map(
        (card) => card.name,
      ),
    ).toEqual(['Amber'])
  })

  it('leaves the unreviewed themes out of /themes, the home row and the palette pages list', async () => {
    await pack('looks', 'Ada', [{ key: 'n', name: 'Nord Night' }])

    expect(await getThemeCards(db)).toEqual([])
    expect(await getHomeThemes(db, 3)).toEqual({ themes: [], total: 0 })
    expect(await getPalettePages(db)).toEqual([])
  })

  it("puts a palette's unreviewed themes on its page beside the reviewed ones, and makes no page of them alone", async () => {
    await pack('looks', 'Ada', [
      { key: 'n', name: 'Nord Night' },
      { key: 'd', name: 'Dracula Dusk' },
    ])
    await plugin('nordic', ['Nord Snow'])

    const page = await getPaletteThemes(db, 'nord')

    expect(named(page?.themes ?? [])).toEqual(['nordic:Nord Snow'])
    expect(page?.unreviewed.map((card) => card.name)).toEqual(['Nord Night'])
    expect(page?.palettes.map((palette) => palette.slug)).toEqual(['nord'])
    expect(await getPaletteThemes(db, 'dracula')).toBeNull()
  })
})
