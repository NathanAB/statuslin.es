import { and, asc, eq, isNotNull, or, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import {
  mods,
  modThemeDesktopPreviews,
  modThemePreviews,
  modThemes,
  modVersions,
} from '@/db/schema'
import { themeDesktopPreviewPath } from '@/lib/site'
import { versionIsThemeOnly } from '@/mods/queries'
import { versionOwner } from '@/mods/unreviewed-queries'
import { compactSegments } from '@/render/compact-segments'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * Every recorded theme of a listed mod's live version. `listed` says which mods: published ones,
 * or curated drafts shown as unreviewed mods.
 */
export function listedThemes<Extra extends Record<string, SQL | SQL.Aliased>>(
  db: Db,
  listed: SQL,
  extra: Extra,
  where?: SQL,
) {
  return db
    .select({
      ...extra,
      id: modThemes.id,
      key: modThemes.key,
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
      mod: { owner: versionOwner, pluginName: mods.pluginName },
      themeOnly: versionIsThemeOnly,
      footprint: modVersions.footprint,
    })
    .from(modThemes)
    .leftJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .leftJoin(modThemeDesktopPreviews, eq(modThemeDesktopPreviews.themeId, modThemes.id))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, and(eq(mods.currentVersionId, modVersions.id), listed))
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

/** Themes by name, whatever its case. */
export const byName = [asc(sql`lower(${modThemes.name})`), asc(modThemes.key)]

export type ThemeRow = Awaited<ReturnType<typeof listedThemes<Record<never, SQL>>>>[number]

/** What a theme card shows of the theme itself: its name, window and recorded preview. */
export function toLook({ id, key, name, window, segments, shot, ...row }: ThemeRow) {
  const base = { id, key, name, window }
  if (row.kind === 'terminal') {
    return {
      ...base,
      kind: row.kind,
      preview: compactSegments(segments ?? []),
      usesTerminalColors: row.usesTerminalColors,
    }
  }
  if (shot === null) throw new Error(`Desktop theme ${id} was listed without its shot`)
  const { width, height, cardWidth, cardHeight, renderedAt } = shot
  return {
    ...base,
    kind: row.kind,
    preview: {
      shot: { src: themeDesktopPreviewPath(id, renderedAt), width, height },
      card: {
        src: themeDesktopPreviewPath(id, renderedAt, 'card'),
        width: cardWidth,
        height: cardHeight,
      },
    },
  }
}
