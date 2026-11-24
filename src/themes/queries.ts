import { and, asc, desc, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, mods, modVersions } from '@/db/schema'
import { hasUnreviewedPage, versionOwner } from '@/mods/unreviewed-queries'
import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { findPalette, type Palette, palettesWithThemes, themesInPalette } from './palettes'
import type { ThemeKind, ThemeWindow } from './theme'
import { byName, listedThemes, type ThemeRow, toLook } from './theme-rows'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A Desktop theme's preview: the whole window, for its plugin's page, and smaller for its card. */
export interface DesktopThemeShot {
  shot: DesktopShotImage
  card: DesktopShotImage
}

interface ThemeCardBase {
  id: string
  /** Its key within its plugin (THEME_KEY), which a re-pin keeps. */
  key: string
  /** The author's name for it, the one its card and `/theme` show. Shown as text. */
  name: string
  kind: ThemeKind
  window: ThemeWindow
  /** The plugin a visitor installs to get it. */
  plugin: {
    /** The plugin's mod id. */
    id: string
    slug: string
    title: string
    authorGithub: string
    /** What its hooks modules can reach, or null for a plugin of theme files alone. */
    code: { footprint: ModFootprint } | null
  }
}

/** One published theme as a visitor browses it: a card on /themes and on its plugin's page. */
export type PublishedTheme =
  | (ThemeCardBase & {
      kind: 'terminal'
      /** The whole screen recorded with this theme selected. */
      preview: AnsiSegment[]
      usesTerminalColors: boolean
    })
  | (ThemeCardBase & {
      kind: 'desktop'
      preview: DesktopThemeShot
      /** What its preview's session sent to switch to it, which its card tells visitors to send. */
      switchSteps: string[]
    })

/** The unreviewed mod a theme comes from (ADR 0014), by its page's address. */
export interface UnreviewedThemeMod {
  owner: string
  pluginName: string
}

/**
 * A theme of a curated draft shown as an unreviewed mod (ADR 0014): its look, and the mod's page.
 * Nothing to install, and no switch steps, which are for an installed plugin.
 */
export type UnreviewedTheme =
  | (Omit<Extract<PublishedTheme, { kind: 'terminal' }>, 'plugin'> & { mod: UnreviewedThemeMod })
  | (Omit<Extract<PublishedTheme, { kind: 'desktop' }>, 'plugin' | 'switchSteps'> & {
      mod: UnreviewedThemeMod
    })

/** The home page's themes row: a few themes' cards, and how many /themes lists in all. */
export interface HomeThemeRow {
  themes: PublishedTheme[]
  total: number
}

function publishedThemes<Extra extends Record<string, SQL | SQL.Aliased>>(
  db: Db,
  extra: Extra,
  where?: SQL,
) {
  return listedThemes(db, eq(mods.status, 'published'), extra, where)
}

/** /themes' plugin order: the most installed first, then by slug. */
const byPlugin = [desc(mods.copyCount), asc(mods.slug)]

function toCard(row: ThemeRow): PublishedTheme {
  const plugin = { ...row.plugin, code: row.themeOnly ? null : { footprint: row.footprint } }
  const look = toLook(row)
  return look.kind === 'terminal'
    ? { ...look, plugin }
    : { ...look, plugin, switchSteps: row.switchSteps ?? [] }
}

const toCards = (rows: ThemeRow[]): PublishedTheme[] => rows.map(toCard)

const toUnreviewed = (row: ThemeRow): UnreviewedTheme => ({ ...toLook(row), mod: row.mod })

/** The unreviewed themes' order: by their mod's address, then by name. */
const byUnreviewedMod = [asc(mods.pluginName), asc(sql`lower(${versionOwner})`)]

/**
 * The themes of the curated drafts shown as unreviewed mods (ADR 0014), or of the one at `mod`'s
 * address: for /themes' and the palette pages' "Not reviewed" sections, and that mod's own page.
 */
export async function getUnreviewedThemeCards(
  db: Db,
  mod?: UnreviewedThemeMod,
): Promise<UnreviewedTheme[]> {
  const at = mod
    ? and(eq(mods.pluginName, mod.pluginName), sql`lower(${versionOwner}) = lower(${mod.owner})`)
    : undefined
  const rows = await listedThemes(db, hasUnreviewedPage(db), {}, at).orderBy(
    ...byUnreviewedMod,
    ...byName,
  )
  return rows.map(toUnreviewed)
}

/** /themes: the most installed plugins' themes first, each plugin's in name order. */
export async function getThemeCards(db: Db): Promise<PublishedTheme[]> {
  return toCards(await publishedThemes(db, {}).orderBy(...byPlugin, ...byName))
}

/**
 * The home page's themes row: the first `limit` themes with plugins taking turns in /themes'
 * order, each giving its themes in name order, so the row shows several plugins' looks once there
 * are several. With how many themes /themes lists, counted before the limit.
 */
export async function getHomeThemes(db: Db, limit: number): Promise<HomeThemeRow> {
  const turn = sql`row_number() over (partition by ${mods.id} order by ${sql.join(byName, sql`, `)})`
  const rows = await publishedThemes(db, { total: sql<number>`count(*) over ()`.mapWith(Number) })
    .orderBy(turn, ...byPlugin)
    .limit(limit)
  return { themes: toCards(rows), total: rows[0]?.total ?? 0 }
}

/** If the themes row fails to load, the failure is reported and the home page renders without the
 * row instead of as an error page. */
export async function homeThemesOrEmpty(
  load: () => Promise<HomeThemeRow>,
  report: (error: unknown) => void,
): Promise<HomeThemeRow> {
  try {
    return await load()
  } catch (error) {
    report(error)
    return { themes: [], total: 0 }
  }
}

/** The themes a published plugin's page lists, in name order. */
export async function getPublishedModThemes(db: Db, slug: string): Promise<PublishedTheme[]> {
  return toCards(await publishedThemes(db, {}, eq(mods.slug, slug)).orderBy(...byName))
}

/**
 * A palette's page: its published themes in /themes' order, its unreviewed mods' themes below
 * them, and every palette with a page.
 */
export interface PaletteThemes {
  palette: Palette
  themes: PublishedTheme[]
  unreviewed: UnreviewedTheme[]
  palettes: Palette[]
}

/**
 * The palette page at `slug`, or null when no palette has that slug or none of its themes is
 * published: an unreviewed theme alone makes no page (ADR 0014).
 */
export async function getPaletteThemes(db: Db, slug: string): Promise<PaletteThemes | null> {
  const palette = findPalette(slug)
  if (!palette) return null
  const all = await getThemeCards(db)
  const themes = themesInPalette(all, palette)
  if (themes.length === 0) return null
  const unreviewed = themesInPalette(await getUnreviewedThemeCards(db), palette)
  return { palette, themes, unreviewed, palettes: palettesWithThemes(all) }
}

/** A palette page as the sitemap lists it: dated by its newest theme's version going live. */
export interface PalettePage {
  palette: Palette
  updatedAt: Date
}

/** Every palette with a page, in /themes' order, without loading any theme's preview. */
export async function getPalettePages(db: Db): Promise<PalettePage[]> {
  // Only the names and dates leave the database: the subquery's previews are never read.
  const published = publishedThemes(db, {
    updatedAt: sql<string>`${modVersions.createdAt}`.as('updated_at'),
  }).as('published')
  const rows = await db
    .select({ name: published.name, updatedAt: published.updatedAt })
    .from(published)
  const themes = rows.map((row) => ({ name: row.name, updatedAt: new Date(row.updatedAt) }))
  return palettesWithThemes(themes).map((palette) => ({
    palette,
    updatedAt: new Date(
      Math.max(...themesInPalette(themes, palette).map((theme) => theme.updatedAt.getTime())),
    ),
  }))
}
