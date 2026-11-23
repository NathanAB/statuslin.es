import { and, asc, desc, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, mods, modThemePreviews, modThemes, modVersions } from '@/db/schema'
import { versionIsThemeOnly } from '@/mods/queries'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import type { ThemeKind, ThemeWindow } from './theme'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** One published theme as a visitor browses it: a card on /themes and on its plugin's page. */
export interface PublishedTheme {
  id: string
  /** The author's name for it, the one `/theme` lists. Shown as text. */
  name: string
  /** Where it applies: the terminal, or (next) Claude Desktop. */
  kind: ThemeKind
  window: ThemeWindow
  /** The whole screen recorded with this theme selected. */
  preview: AnsiSegment[]
  /** The plugin a visitor installs to get it. */
  plugin: {
    /** The plugin's mod id, which a copy of its install command counts against. */
    id: string
    slug: string
    title: string
    authorGithub: string
    /** What its hooks modules can reach, or null for a plugin of theme files alone. */
    code: { footprint: ModFootprint } | null
  }
}

/** The home page's themes row: a few themes' cards, and how many /themes lists in all. */
export interface HomeThemeRow {
  themes: PublishedTheme[]
  total: number
}

/**
 * Every theme of a published plugin's live version that has its preview, with any `extra` columns
 * a caller needs beside the card's.
 */
function publishedThemes<Extra extends Record<string, SQL>>(db: Db, extra: Extra) {
  return db
    .select({
      ...extra,
      id: modThemes.id,
      name: modThemes.name,
      kind: modThemes.kind,
      window: modThemes.window,
      preview: modThemePreviews.segments,
      plugin: { id: mods.id, slug: mods.slug, title: mods.title, authorGithub: mods.authorGithub },
      themeOnly: versionIsThemeOnly,
      footprint: modVersions.footprint,
    })
    .from(modThemes)
    .innerJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, and(eq(mods.currentVersionId, modVersions.id), eq(mods.status, 'published')))
    .$dynamic()
}

const byName = [asc(sql`lower(${modThemes.name})`), asc(modThemes.key)]
/** /themes' plugin order: the most installed first, then by slug. */
const byPlugin = [desc(mods.copyCount), asc(mods.slug)]

type ThemeRow = Awaited<ReturnType<typeof publishedThemes<Record<never, SQL>>>>[number]

const toCards = (rows: ThemeRow[]): PublishedTheme[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    window: row.window,
    preview: compactSegments(row.preview),
    plugin: { ...row.plugin, code: row.themeOnly ? null : { footprint: row.footprint } },
  }))

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

/** The themes a published plugin's page lists, in name order. */
export async function getPublishedModThemes(db: Db, slug: string): Promise<PublishedTheme[]> {
  return toCards(
    await publishedThemes(db, {})
      .where(eq(mods.slug, slug))
      .orderBy(...byName),
  )
}
