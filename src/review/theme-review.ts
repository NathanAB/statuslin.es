import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modThemeDesktopPreviews, modThemePreviews, modThemes } from '@/db/schema'
import type { AnsiSegment } from '@/render/types'
import type { ThemeWindow } from '@/themes/theme'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { adminThemeDesktopPreviewPath } from './theme-desktop-preview'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

interface ReviewThemeBase {
  id: string
  key: string
  /** The author's text, shown as text. */
  name: string
  window: ThemeWindow
}

/**
 * A theme as the operator reviews it: a terminal theme's preview beside the exact file it was
 * recorded from, or a Desktop theme's whole-window shot beside the steps its recording sent, which
 * its card will tell visitors to send. A Desktop theme is the mod's code, reviewed with the mod.
 */
export type ReviewTheme =
  | (ReviewThemeBase & {
      kind: 'terminal'
      /** The theme file exactly as pinned. */
      source: string
      /** The whole recorded screen; null before it renders. */
      preview: AnsiSegment[] | null
      usesTerminalColors: boolean
    })
  | (ReviewThemeBase & {
      kind: 'desktop'
      switchSteps: string[]
      /** The whole window, served to an admin only; null before it renders. */
      preview: DesktopShotImage | null
    })

function reviewThemeRows(database: Db, versionIds: string[]) {
  return database
    .select({
      versionId: modThemes.modVersionId,
      id: modThemes.id,
      kind: modThemes.kind,
      key: modThemes.key,
      name: modThemes.name,
      window: modThemes.window,
      usesTerminalColors: modThemes.usesTerminalColors,
      source: modThemes.source,
      switchSteps: modThemes.switchSteps,
      segments: modThemePreviews.segments,
      shot: { width: modThemeDesktopPreviews.width, height: modThemeDesktopPreviews.height },
    })
    .from(modThemes)
    .leftJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .leftJoin(modThemeDesktopPreviews, eq(modThemeDesktopPreviews.themeId, modThemes.id))
    .where(inArray(modThemes.modVersionId, versionIds))
    .orderBy(asc(sql`lower(${modThemes.name})`), asc(modThemes.key))
}

type ReviewRow = Omit<Awaited<ReturnType<typeof reviewThemeRows>>[number], 'versionId'>

function toReviewTheme({
  source,
  switchSteps,
  segments,
  shot,
  usesTerminalColors,
  ...theme
}: ReviewRow): ReviewTheme {
  if (theme.kind === 'terminal') {
    return {
      ...theme,
      kind: theme.kind,
      source: source ?? '',
      preview: segments,
      usesTerminalColors,
    }
  }
  return {
    ...theme,
    kind: theme.kind,
    switchSteps: switchSteps ?? [],
    preview: shot && { src: adminThemeDesktopPreviewPath(theme.id), ...shot },
  }
}

/** The themes each of these versions carries, by version id, in name order. */
export async function getReviewThemes(
  database: Db,
  versionIds: string[],
): Promise<Map<string, ReviewTheme[]>> {
  const byVersion = new Map<string, ReviewTheme[]>()
  if (versionIds.length === 0) return byVersion
  for (const { versionId, ...theme } of await reviewThemeRows(database, versionIds)) {
    byVersion.set(versionId, [...(byVersion.get(versionId) ?? []), toReviewTheme(theme)])
  }
  return byVersion
}
