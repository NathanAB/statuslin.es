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
import type { ThemeWindow } from './theme'

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
  window: ThemeWindow
  /** The plugin a visitor installs to get it. */
  plugin: {
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
    })
  | (ThemeCardBase & {
      kind: 'desktop'
      preview: DesktopThemeShot
      /** What its preview's session sent to switch to it, which its card tells visitors to send. */
      switchSteps: string[]
    })

/**
 * Every theme of a published plugin's live version that has its preview, and meets `where` when
 * given. Never the PNGs, which only the image route sends.
 */
function publishedThemes(db: Db, where?: SQL) {
  return db
    .select({
      id: modThemes.id,
      kind: modThemes.kind,
      name: modThemes.name,
      window: modThemes.window,
      switchSteps: modThemes.switchSteps,
      segments: modThemePreviews.segments,
      shot: {
        width: modThemeDesktopPreviews.width,
        height: modThemeDesktopPreviews.height,
        cardWidth: modThemeDesktopPreviews.cardWidth,
        cardHeight: modThemeDesktopPreviews.cardHeight,
        renderedAt: modThemeDesktopPreviews.createdAt,
      },
      plugin: { slug: mods.slug, title: mods.title, authorGithub: mods.authorGithub },
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

type ThemeRow = Awaited<ReturnType<typeof publishedThemes>>[number]

function toCard({ themeOnly, footprint, segments, shot, switchSteps, ...row }: ThemeRow) {
  const base = { ...row, plugin: { ...row.plugin, code: themeOnly ? null : { footprint } } }
  if (row.kind === 'terminal') {
    return { ...base, kind: row.kind, preview: compactSegments(segments ?? []) }
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
  return toCards(await publishedThemes(db).orderBy(desc(mods.copyCount), asc(mods.slug), ...byName))
}

/** The themes a published plugin's page lists, in name order. */
export async function getPublishedModThemes(db: Db, slug: string): Promise<PublishedTheme[]> {
  return toCards(await publishedThemes(db, eq(mods.slug, slug)).orderBy(...byName))
}
