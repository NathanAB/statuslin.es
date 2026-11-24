import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { modDesktopPreviews, mods, modVersions } from '@/db/schema'
import { IMMUTABLE_CACHE } from '@/lib/cache-control'
import { isPreviewImageQuery, previewImageResponse } from '@/lib/preview-image'
import { isUuid } from '@/lib/uuid'
import { MOD_SCENARIO_KEY } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * The Desktop shot of a published mod's current version, or with `image` 'card' its card image, as
 * served at MOD_DESKTOP_PREVIEW_ROUTE. It is visible exactly when the mod page that shows it is,
 * and only under the `r` (render) its page names (modDesktopPreviewPath), with no other query, so a
 * made-up URL can't skip the cache: anything else is a 404. A new render gets a new URL, which lets
 * a cache keep each one for good.
 */
export async function modDesktopPreviewResponse(
  db: Db,
  versionId: string,
  query: URLSearchParams,
): Promise<Response> {
  const image = query.get('image')
  if (
    !isUuid(versionId) ||
    !isPreviewImageQuery(query, ['r', 'image']) ||
    (image !== null && image !== 'card')
  ) {
    return new Response('Not found', { status: 404 })
  }
  const [row] = await db
    .select({
      png: image === 'card' ? modDesktopPreviews.cardPng : modDesktopPreviews.png,
      renderedAt: modDesktopPreviews.createdAt,
    })
    .from(modDesktopPreviews)
    .innerJoin(modVersions, eq(modVersions.id, modDesktopPreviews.modVersionId))
    .innerJoin(mods, eq(mods.currentVersionId, modVersions.id))
    .where(
      and(
        eq(modDesktopPreviews.modVersionId, versionId),
        eq(modDesktopPreviews.scenarioKey, MOD_SCENARIO_KEY),
        eq(mods.status, 'published'),
      ),
    )
  if (!row?.png || query.get('r') !== String(row.renderedAt.getTime())) {
    return new Response('Not found', { status: 404 })
  }
  return previewImageResponse(row.png, IMMUTABLE_CACHE)
}

// createServerOnlyFn keeps `db` out of the client bundle, as for the marketplace route.
export const modDesktopPreviewResponseForRoute = createServerOnlyFn(
  (versionId: string, query: URLSearchParams): Promise<Response> =>
    modDesktopPreviewResponse(defaultDb, versionId, query),
)
