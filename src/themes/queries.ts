import { and, asc, desc, eq, isNotNull, or, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import {
  type ModFootprint,
  mods,
  modThemeDesktopPreviews,
  modThemePreviews,
  modThemes,
  modVersions,
} from '@/db/schema'
import { themeDesktopPreviewPath } from '@/lib/site'
import { versionIsThemeOnly } from '@/mods/queries'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import type { ThemeKind, ThemeWindow } from './theme'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A Desktop theme's preview: the whole window, for its plugin's page, and smaller for its card. */
export interface DesktopThemeShot {
  shot: DesktopShotImage
  card: DesktopShotImage
}

interface ThemeCardBase {
  id: string
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
      /** On an ANSI base: it draws with the visitor's own terminal palette, not its preview's. */
      usesTerminalColors: boolean
    })
  | (ThemeCardBase & {
      kind: 'desktop'
      preview: DesktopThemeShot
      /** What its preview's session sent to switch to it, which its card tells visitors to send. */
      switchSteps: string[]
    })

/** The home page's themes row: a few themes' cards, and how many /themes lists in all. */
export interface HomeThemeRow {
  themes: PublishedTheme[]
  total: number
}

function publishedThemes<Extra extends Record<string, SQL>>(db: Db, extra: Extra, where?: SQL) {
  return db
    .select({
      ...extra,
      id: modThemes.id,
      kind: modThemes.kind,
      name: modThemes.name,
      window: modThemes.window,
      usesTerminalColors: modThemes.usesTerminalColors,
      switchSteps: modThemes.switchSteps,
      segments: modThemePreviews.segments,
      shot: {
        width: modThemeDesktopPreviews.width,
        height: modThemeDesktopPreviews.height,
        cardWidth: modThemeDesktopPreviews.cardWidth,
        cardHeight: modThemeDesktopPreviews.cardHeight,
        renderedAt: modThemeDesktopPreviews.createdAt,
      },
      plugin: { id: mods.id, slug: mods.slug, title: mods.title, authorGithub: mods.authorGithub },
      themeOnly: versionIsThemeOnly,
      footprint: modVersions.footprint,
    })
    .from(modThemes)
    .leftJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .leftJoin(modThemeDesktopPreviews, eq(modThemeDesktopPreviews.themeId, modThemes.id))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, and(eq(mods.currentVersionId, modVersions.id), eq(mods.status, 'published')))
    .where(
      and(
        or(
          and(eq(modThemes.kind, 'terminal'), isNotNull(modThemePreviews.id)),
          and(eq(modThemes.kind, 'desktop'), isNotNull(modThemeDesktopPreviews.id)),
        ),
        where,
      ),
    )
    .$dynamic()
}

const byName = [asc(sql`lower(${modThemes.name})`), asc(modThemes.key)]
/** /themes' plugin order: the most installed first, then by slug. */
const byPlugin = [desc(mods.copyCount), asc(mods.slug)]

type ThemeRow = Awaited<ReturnType<typeof publishedThemes<Record<never, SQL>>>>[number]

function toCard({ themeOnly, footprint, segments, shot, switchSteps, ...row }: ThemeRow) {
  const { id, name, window, plugin } = row
  const base = { id, name, window, plugin: { ...plugin, code: themeOnly ? null : { footprint } } }
  if (row.kind === 'terminal') {
    return {
      ...base,
      kind: row.kind,
      preview: compactSegments(segments ?? []),
      usesTerminalColors: row.usesTerminalColors,
    }
  }
  if (shot === null) throw new Error(`Desktop theme ${row.id} was listed without its shot`)
  const { width, height, cardWidth, cardHeight, renderedAt } = shot
  return {
    ...base,
    kind: row.kind,
    preview: {
      shot: { src: themeDesktopPreviewPath(row.id, renderedAt), width, height },
      card: {
        src: themeDesktopPreviewPath(row.id, renderedAt, 'card'),
        width: cardWidth,
        height: cardHeight,
      },
    },
    switchSteps: switchSteps ?? [],
  }
}

const toCards = (rows: ThemeRow[]): PublishedTheme[] => rows.map(toCard)

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
