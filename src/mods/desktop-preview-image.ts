import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { modDesktopPreviews, mods, modVersions } from '@/db/schema'
import { isUuid } from '@/lib/uuid'
import { MOD_SCENARIO_KEY } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * The Desktop shot of a published mod's current version, as served at MOD_DESKTOP_PREVIEW_ROUTE.
 * It is visible exactly when the mod page that shows it is: anything else is a 404. The bytes are
 * untrusted pixels, so nosniff keeps a browser from reading them as anything but a PNG.
 */
export async function modDesktopPreviewResponse(db: Db, versionId: string): Promise<Response> {
  if (!isUuid(versionId)) return new Response('Not found', { status: 404 })
  const [row] = await db
    .select({ png: modDesktopPreviews.png })
    .from(modDesktopPreviews)
    .innerJoin(modVersions, eq(modVersions.id, modDesktopPreviews.modVersionId))
    .innerJoin(mods, and(eq(mods.currentVersionId, modVersions.id), eq(mods.id, modVersions.modId)))
    .where(
      and(
        eq(modDesktopPreviews.modVersionId, versionId),
        eq(modDesktopPreviews.scenarioKey, MOD_SCENARIO_KEY),
        eq(mods.status, 'published'),
      ),
    )
  if (!row?.png) return new Response('Not found', { status: 404 })
  return new Response(new Blob([row.png as BufferSource]), {
    headers: {
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

// createServerOnlyFn keeps `db` out of the client bundle, as for the marketplace route.
export const modDesktopPreviewResponseForRoute = createServerOnlyFn(
  (versionId: string): Promise<Response> => modDesktopPreviewResponse(defaultDb, versionId),
)
