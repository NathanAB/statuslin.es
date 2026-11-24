import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { mods, modThemeDesktopPreviews, modThemes, modVersions } from '@/db/schema'
import { PREVIEW_IMAGE_CACHE } from '@/lib/cache-control'
import { pngIfRender, previewImageResponse, readPreviewImageQuery } from '@/lib/preview-image'
import { isUuid } from '@/lib/uuid'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const notFound = () => new Response('Not found', { status: 404 })

/**
 * The whole-window shot of a Desktop theme on a published plugin's live version, or with `image`
 * 'card' its card image, as served at THEME_DESKTOP_PREVIEW_ROUTE. It is visible exactly when the
 * theme's card is, and only under the `r` (render) its card names (themeDesktopPreviewPath), with no
 * other query, so a made-up URL can't skip the cache, and a new recording gets a new URL, which lets
 * a browser keep each one for good.
 */
export async function themeDesktopPreviewResponse(
  db: Db,
  themeId: string,
  search: string,
): Promise<Response> {
  const query = readPreviewImageQuery(search, true)
  if (!isUuid(themeId) || !query) return notFound()
  const [row] = await db
    .select({
      png: pngIfRender(
        query.image === 'card' ? modThemeDesktopPreviews.cardPng : modThemeDesktopPreviews.png,
        modThemeDesktopPreviews.createdAt,
        query.render,
      ),
    })
    .from(modThemeDesktopPreviews)
    .innerJoin(modThemes, eq(modThemes.id, modThemeDesktopPreviews.themeId))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, eq(mods.currentVersionId, modVersions.id))
    .where(and(eq(modThemeDesktopPreviews.themeId, themeId), eq(mods.status, 'published')))
  if (!row?.png) return notFound()
  return previewImageResponse(row.png, PREVIEW_IMAGE_CACHE)
}

export const themeDesktopPreviewResponseForRoute = createServerOnlyFn(
  (themeId: string, search: string): Promise<Response> =>
    themeDesktopPreviewResponse(defaultDb, themeId, search),
)
