import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import * as schema from '@/db/schema'
import type { DesktopRecorder } from '@/render/mods/desktop/types'
import { DesktopThemeRefused } from '@/render/mods/desktop/window-shot'
import type { ModUnderRender } from '@/render/mods/recorder'
import type { ThemeWindow } from './theme'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface DesktopThemeToRecord {
  id: string
  key: string
  window: ThemeWindow
  /** Stored jsonb, parsed when the theme records so a malformed row fails only its own theme. */
  switchSteps: unknown
}

const switchStepsSchema = z.array(z.string())

/** A version's Desktop themes in key order: all of them, or only those with no shot yet. */
export async function desktopThemesToRecord(
  db: Db,
  versionId: string,
  { rerecord }: { rerecord: boolean },
): Promise<DesktopThemeToRecord[]> {
  return db
    .select({
      id: schema.modThemes.id,
      key: schema.modThemes.key,
      window: schema.modThemes.window,
      switchSteps: schema.modThemes.switchSteps,
    })
    .from(schema.modThemes)
    .leftJoin(
      schema.modThemeDesktopPreviews,
      eq(schema.modThemeDesktopPreviews.themeId, schema.modThemes.id),
    )
    .where(
      and(
        eq(schema.modThemes.modVersionId, versionId),
        eq(schema.modThemes.kind, 'desktop'),
        rerecord ? undefined : isNull(schema.modThemeDesktopPreviews.id),
      ),
    )
    .orderBy(schema.modThemes.key)
}

/**
 * Records the theme in Claude Desktop, in its window after its switch steps, and replaces its shot.
 * A refused recording (the theme didn't apply, showed the other window, or differs between runs)
 * removes any earlier shot, so the version can't publish until that is fixed; a recording that
 * failed for any other reason keeps it.
 */
export async function recordDesktopThemePreview(
  db: Db,
  recorder: DesktopRecorder,
  mod: ModUnderRender,
  theme: DesktopThemeToRecord,
): Promise<void> {
  try {
    const shot = await recorder.recordTheme({
      mod,
      window: theme.window,
      switchSteps: switchStepsSchema.parse(theme.switchSteps),
    })
    const preview = {
      png: shot.png,
      width: shot.width,
      height: shot.height,
      cardPng: shot.card.png,
      cardWidth: shot.card.width,
      cardHeight: shot.card.height,
      lookSignature: shot.look,
      desktopVersion: shot.desktopVersion,
      engineVersion: shot.engineVersion,
    }
    await db
      .insert(schema.modThemeDesktopPreviews)
      .values({ themeId: theme.id, ...preview })
      .onConflictDoUpdate({
        target: schema.modThemeDesktopPreviews.themeId,
        set: { ...preview, createdAt: sql`now()` },
      })
  } catch (error) {
    if (error instanceof DesktopThemeRefused) {
      await db
        .delete(schema.modThemeDesktopPreviews)
        .where(eq(schema.modThemeDesktopPreviews.themeId, theme.id))
    }
    throw error
  }
}

/** A Desktop theme whose stored shot looked the same as other themes' of its version, by key. */
export interface DesktopLookalike {
  key: string
  matches: string[]
}

/**
 * Removes every stored Desktop theme shot of the version that has the same look as another one of
 * its shots, whichever run stored it, so no two cards show one look under different names: switch
 * steps that never switch would record the mod's default under every name. Returns each refused
 * theme with the themes it matched, in key order.
 */
export async function refuseDesktopLookalikes(
  db: Db,
  versionId: string,
): Promise<DesktopLookalike[]> {
  const stored = await db
    .select({
      id: schema.modThemes.id,
      key: schema.modThemes.key,
      look: schema.modThemeDesktopPreviews.lookSignature,
    })
    .from(schema.modThemes)
    .innerJoin(
      schema.modThemeDesktopPreviews,
      eq(schema.modThemeDesktopPreviews.themeId, schema.modThemes.id),
    )
    .where(and(eq(schema.modThemes.modVersionId, versionId), eq(schema.modThemes.kind, 'desktop')))
  const byLook = new Map<string, typeof stored>()
  for (const theme of stored) byLook.set(theme.look, [...(byLook.get(theme.look) ?? []), theme])
  const alike = [...byLook.values()].filter((group) => group.length > 1)
  if (alike.length === 0) return []
  await db.delete(schema.modThemeDesktopPreviews).where(
    inArray(
      schema.modThemeDesktopPreviews.themeId,
      alike.flat().map(({ id }) => id),
    ),
  )
  return alike
    .flatMap((group) =>
      group.map(({ key }) => ({
        key,
        matches: group.flatMap((t) => (t.key === key ? [] : [t.key])).sort(),
      })),
    )
    .sort((a, b) => a.key.localeCompare(b.key))
}
