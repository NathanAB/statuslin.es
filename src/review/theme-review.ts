import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modThemePreviews, modThemes } from '@/db/schema'
import type { AnsiSegment } from '@/render/types'
import type { ThemeWindow } from '@/themes/theme'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A theme as the operator reviews it: its preview beside the exact file it was recorded from. */
export interface ReviewTheme {
  id: string
  key: string
  /** The author's text, shown as text. */
  name: string
  window: ThemeWindow
  /** The theme file exactly as pinned. */
  source: string
  /** The whole recorded screen; null before it renders. */
  preview: AnsiSegment[] | null
}

/** The themes each of these versions carries, by version id, in name order. */
export async function getReviewThemes(
  database: Db,
  versionIds: string[],
): Promise<Map<string, ReviewTheme[]>> {
  const byVersion = new Map<string, ReviewTheme[]>()
  if (versionIds.length === 0) return byVersion
  const rows = await database
    .select({
      versionId: modThemes.modVersionId,
      id: modThemes.id,
      key: modThemes.key,
      name: modThemes.name,
      window: modThemes.window,
      source: sql<string>`${modThemes.source}`,
      preview: modThemePreviews.segments,
    })
    .from(modThemes)
    .leftJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .where(and(inArray(modThemes.modVersionId, versionIds), eq(modThemes.kind, 'terminal')))
    .orderBy(asc(sql`lower(${modThemes.name})`), asc(modThemes.key))
  for (const { versionId, ...theme } of rows) {
    byVersion.set(versionId, [...(byVersion.get(versionId) ?? []), theme])
  }
  return byVersion
}
