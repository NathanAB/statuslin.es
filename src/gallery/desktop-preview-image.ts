import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { configDesktopPreviews, configs, configVersions } from '@/db/schema'
import { isUuid } from '@/lib/uuid'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * The Desktop shot of a published status line's current version, as served at
 * CONFIG_DESKTOP_PREVIEW_ROUTE. It is visible exactly when the status line page that shows it is,
 * and only under the `render` its page names (configDesktopPreviewPath), so a made-up URL can't
 * skip the cache: anything else is a 404. The bytes are untrusted pixels, so nosniff keeps a
 * browser from reading them as anything but a PNG.
 */
export async function configDesktopPreviewResponse(
  db: Db,
  versionId: string,
  render: string | null,
): Promise<Response> {
  if (!isUuid(versionId)) return new Response('Not found', { status: 404 })
  const [row] = await db
    .select({ png: configDesktopPreviews.png, renderedAt: configDesktopPreviews.createdAt })
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
  if (!row?.png || render !== String(row.renderedAt.getTime())) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(new Blob([row.png as BufferSource]), {
    headers: {
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      // An hour, like the og cards: a removed status line's image must leave shared caches soon after.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

// createServerOnlyFn keeps `db` out of the client bundle, as for the mod preview route.
export const configDesktopPreviewResponseForRoute = createServerOnlyFn(
  (versionId: string, render: string | null): Promise<Response> =>
    configDesktopPreviewResponse(defaultDb, versionId, render),
)
