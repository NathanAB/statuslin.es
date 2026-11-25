import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { configDesktopPreviews, configs, configVersions } from '@/db/schema'
import { PREVIEW_IMAGE_CACHE } from '@/lib/cache-control'
import { pngIfRender, previewImageResponse, readPreviewImageQuery } from '@/lib/preview-image'
import { isUuid } from '@/lib/uuid'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * The Desktop shot of a published status line's current version, as served at
 * CONFIG_DESKTOP_PREVIEW_ROUTE. It is visible exactly when the status line page that shows it is,
 * and only under the `r` (render) its page names (configDesktopPreviewPath), with no other query, so
 * a made-up URL can't skip the cache: anything else is a 404. A new render gets a new URL, which
 * lets a browser keep each one for good.
 */
export async function configDesktopPreviewResponse(
  db: Db,
  versionId: string,
  search: string,
): Promise<Response> {
  const query = readPreviewImageQuery(search, false)
  if (!isUuid(versionId) || !query) {
    return new Response('Not found', { status: 404 })
  }
  const [row] = await db
    .select({
      png: pngIfRender(configDesktopPreviews.png, configDesktopPreviews.createdAt, query.render),
    })
    .from(configDesktopPreviews)
    .innerJoin(configVersions, eq(configVersions.id, configDesktopPreviews.configVersionId))
    // current_version_id has no foreign key, so the join also checks the version is this config's.
    .innerJoin(
      configs,
      and(eq(configs.currentVersionId, configVersions.id), eq(configs.id, configVersions.configId)),
    )
    .where(
      and(eq(configDesktopPreviews.configVersionId, versionId), eq(configs.status, 'published')),
    )
  if (!row?.png) {
    return new Response('Not found', { status: 404 })
  }
  return previewImageResponse(row.png, PREVIEW_IMAGE_CACHE)
}

// createServerOnlyFn keeps `db` out of the client bundle, as for the mod preview route.
export const configDesktopPreviewResponseForRoute = createServerOnlyFn(
  (versionId: string, search: string): Promise<Response> =>
    configDesktopPreviewResponse(defaultDb, versionId, search),
)
