import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modDesktopPreviews, mods, modVersions } from '@/db/schema'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { desktopPreview, desktopPreviewColumns, desktopPreviewJoin } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * What a page that links a mod needs: whether its page exists (published), and if so whether its
 * current version has a Claude Desktop screenshot to show.
 */
export type ModDesktopShot =
  | { kind: 'unpublished' }
  | { kind: 'no-shot' }
  | { kind: 'shot'; shot: DesktopShotImage }

/** One row, no previews' text or PNG bytes: published the way `getModDetail` counts it. */
export async function getModDesktopShot(db: Db, slug: string): Promise<ModDesktopShot> {
  const [row] = await db
    .select({ desktop: desktopPreviewColumns })
    .from(mods)
    .innerJoin(
      modVersions,
      and(eq(modVersions.id, mods.currentVersionId), eq(modVersions.modId, mods.id)),
    )
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .where(and(eq(mods.slug, slug), eq(mods.status, 'published')))
  if (!row) return { kind: 'unpublished' }
  const desktop = desktopPreview(row.desktop)
  return desktop?.kind === 'shot' ? { kind: 'shot', shot: desktop.shot } : { kind: 'no-shot' }
}
