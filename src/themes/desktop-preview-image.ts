import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { mods, modThemeDesktopPreviews, modThemes, modVersions } from '@/db/schema'
import { isUuid } from '@/lib/uuid'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const notFound = () => new Response('Not found', { status: 404 })

/**
 * The whole-window shot of a Desktop theme on a published plugin's live version, or with `image`
 * 'card' its card image, as served at THEME_DESKTOP_PREVIEW_ROUTE. It is visible exactly when the
 * theme's card is, and only under the `render` its card names (themeDesktopPreviewPath), so a
 * made-up URL can't skip the cache. The bytes are untrusted pixels, so nosniff keeps a browser from
 * reading them as anything but a PNG.
 */
export async function themeDesktopPreviewResponse(
  db: Db,
  themeId: string,
  render: string | null,
  image: string | null,
): Promise<Response> {
  if (!isUuid(themeId) || (image !== null && image !== 'card')) return notFound()
  const [row] = await db
    .select({
      png: image === 'card' ? modThemeDesktopPreviews.cardPng : modThemeDesktopPreviews.png,
      renderedAt: modThemeDesktopPreviews.createdAt,
    })
    .from(modThemeDesktopPreviews)
    .innerJoin(modThemes, eq(modThemes.id, modThemeDesktopPreviews.themeId))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, eq(mods.currentVersionId, modVersions.id))
    .where(and(eq(modThemeDesktopPreviews.themeId, themeId), eq(mods.status, 'published')))
  if (!row || render !== String(row.renderedAt.getTime())) return notFound()
  return new Response(new Blob([row.png as BufferSource]), {
    headers: {
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

export const themeDesktopPreviewResponseForRoute = createServerOnlyFn(
  (themeId: string, render: string | null, image: string | null): Promise<Response> =>
    themeDesktopPreviewResponse(defaultDb, themeId, render, image),
)
