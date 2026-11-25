import { createServerOnlyFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { modThemeDesktopPreviews } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { previewImageResponse } from '@/lib/preview-image'
import { isUuid } from '@/lib/uuid'
import { assertAdmin } from './admin'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const ADMIN_THEME_DESKTOP_PREVIEW_ROUTE = '/admin/theme-previews/$themeId/desktop.png'

const NO_STORE = 'private, no-store'
const UNCACHED = { 'Cache-Control': NO_STORE }

export function adminThemeDesktopPreviewPath(themeId: string): string {
  return ADMIN_THEME_DESKTOP_PREVIEW_ROUTE.replace('$themeId', themeId)
}

/**
 * Any Desktop theme's whole-window shot, for an admin only, as the mod shot's admin route serves
 * any version's (mod-desktop-preview.ts): untrusted pixels, nosniff, never cached.
 */
export async function adminThemeDesktopPreviewResponse(
  database: Db,
  headers: Headers,
  themeId: string,
): Promise<Response> {
  try {
    await assertAdmin(headers)
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return new Response('Forbidden', { status, headers: UNCACHED })
  }
  if (!isUuid(themeId)) return new Response('Not found', { status: 404, headers: UNCACHED })
  const [row] = await database
    .select({ png: modThemeDesktopPreviews.png })
    .from(modThemeDesktopPreviews)
    .where(eq(modThemeDesktopPreviews.themeId, themeId))
  if (!row) return new Response('Not found', { status: 404, headers: UNCACHED })
  return previewImageResponse(row.png, NO_STORE)
}

export const adminThemeDesktopPreviewResponseForRoute = createServerOnlyFn(
  (headers: Headers, themeId: string): Promise<Response> =>
    adminThemeDesktopPreviewResponse(defaultDb, headers, themeId),
)
