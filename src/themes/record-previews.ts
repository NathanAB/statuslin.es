import { and, eq, isNull, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { boundRecording } from '@/render/mods/bound-recording'
import type { ModRecorder, ModUnderRender, RecordRequest } from '@/render/mods/recorder'
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

/** The version's own recording request, which each of its themes is recorded with. */
export type ThemedRequest = Omit<RecordRequest, 'mod' | 'theme'> & { mod: ModUnderRender }

/**
 * Records the session in the theme, selected the way a visitor picks it in `/theme`, and replaces
 * the theme's preview with the whole screen.
 */
export async function recordThemePreview(
  db: Db,
  recorder: ModRecorder,
  request: ThemedRequest,
  theme: ThemeToRecord,
): Promise<void> {
  const setting = terminalThemeSetting(request.mod.pluginName, theme.key)
  const recording = boundRecording(await recorder.record({ ...request, theme: setting }))
  const preview = {
    segments: themeScreenPreview(recording.rows),
    claudeCodeVersion: recording.claudeCodeVersion,
  }
  await db
    .insert(schema.modThemePreviews)
    .values({ themeId: theme.id, ...preview })
    .onConflictDoUpdate({
      target: schema.modThemePreviews.themeId,
      set: { ...preview, createdAt: sql`now()` },
    })
}
