import { isDeepStrictEqual } from 'node:util'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { boundRecording } from '@/render/mods/bound-recording'
import type { ModRecorder, ModUnderRender, Recording } from '@/render/mods/recorder'
import { terminalThemeSetting } from './theme'
import { themeScreenPreview } from './theme-screen'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface ThemeToRecord {
  id: string
  key: string
}

/** A version's terminal themes in key order: all of them, or only those with no preview yet. */
export async function themesToRecord(
  db: Db,
  versionId: string,
  { rerecord }: { rerecord: boolean },
): Promise<ThemeToRecord[]> {
  return db
    .select({ id: schema.modThemes.id, key: schema.modThemes.key })
    .from(schema.modThemes)
    .leftJoin(schema.modThemePreviews, eq(schema.modThemePreviews.themeId, schema.modThemes.id))
    .where(
      and(
        eq(schema.modThemes.modVersionId, versionId),
        eq(schema.modThemes.kind, 'terminal'),
        rerecord ? undefined : isNull(schema.modThemePreviews.id),
      ),
    )
    .orderBy(schema.modThemes.key)
}

/** The theme scene with no theme and no plugin, in the Claude Code version the theme ran. */
export type NoThemeScreen = (claudeCodeVersion: string) => Promise<Recording>

/**
 * Records the theme scene in the theme, selected the way a visitor picks it in `/theme`, with the
 * plugin that carries it, and replaces the theme's preview with the whole screen. A screen that
 * looks the same as `noTheme`'s is refused and the theme is left with no preview: Claude Code
 * ignored the setting, and the card would show its default look under the theme's name.
 */
export async function recordThemePreview(
  db: Db,
  recorder: ModRecorder,
  mod: ModUnderRender,
  theme: ThemeToRecord,
  noTheme: NoThemeScreen,
): Promise<void> {
  const setting = terminalThemeSetting(mod.pluginName, theme.key)
  const recording = boundRecording(await recorder.record({ scene: 'theme', mod, theme: setting }))
  const preview = {
    segments: themeScreenPreview(recording.rows),
    claudeCodeVersion: recording.claudeCodeVersion,
  }
  const unthemed = await noTheme(recording.claudeCodeVersion)
  if (isDeepStrictEqual(preview.segments, themeScreenPreview(unthemed.rows))) {
    await db.delete(schema.modThemePreviews).where(eq(schema.modThemePreviews.themeId, theme.id))
    throw new Error(
      "looks the same as a session with no theme, so the theme setting likely didn't apply",
    )
  }
  await db
    .insert(schema.modThemePreviews)
    .values({ themeId: theme.id, ...preview })
    .onConflictDoUpdate({
      target: schema.modThemePreviews.themeId,
      set: { ...preview, createdAt: sql`now()` },
    })
}

/** A theme whose stored preview looked the same as other themes' of its version, by key. */
export interface Lookalike {
  key: string
  matches: string[]
}

/**
 * Removes every stored terminal theme preview of the version that is the same as another one of its
 * previews, whichever run stored it, so no two cards show one look under different names. Returns
 * each refused theme with the themes it matched, in key order.
 */
export async function refuseLookalikePreviews(db: Db, versionId: string): Promise<Lookalike[]> {
  const stored = await db
    .select({
      id: schema.modThemes.id,
      key: schema.modThemes.key,
      segments: schema.modThemePreviews.segments,
    })
    .from(schema.modThemes)
    .innerJoin(schema.modThemePreviews, eq(schema.modThemePreviews.themeId, schema.modThemes.id))
    .where(and(eq(schema.modThemes.modVersionId, versionId), eq(schema.modThemes.kind, 'terminal')))
    .orderBy(schema.modThemes.key)
  // jsonb comes back with its keys in one canonical order, so equal previews serialize alike.
  const byLook = new Map<string, typeof stored>()
  for (const theme of stored) {
    const look = JSON.stringify(theme.segments)
    byLook.set(look, [...(byLook.get(look) ?? []), theme])
  }
  const alike = [...byLook.values()].filter((group) => group.length > 1)
  if (alike.length === 0) return []
  await db.delete(schema.modThemePreviews).where(
    inArray(
      schema.modThemePreviews.themeId,
      alike.flat().map(({ id }) => id),
    ),
  )
  return alike.flatMap((group) =>
    group.map(({ key }) => ({
      key,
      matches: group.flatMap((t) => (t.key === key ? [] : [t.key])),
    })),
  )
}
