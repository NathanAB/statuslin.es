import { createServerOnlyFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { modThemeDesktopPreviews } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { isUuid } from '@/lib/uuid'
import { assertAdmin } from './admin'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Where /admin shows a Desktop theme's whole-window shot before its plugin is published. */
export const ADMIN_THEME_DESKTOP_PREVIEW_ROUTE = '/admin/theme-previews/$themeId/desktop.png'

/** Nothing here may be cached: not the image, and not a refusal a later admin would get. */
const UNCACHED = { 'Cache-Control': 'private, no-store' }

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
  return new Response(new Blob([row.png as BufferSource]), {
    headers: {
      ...UNCACHED,
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      // Opened on its own, the bytes still can't run as a page.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}

export const adminThemeDesktopPreviewResponseForRoute = createServerOnlyFn(
  (headers: Headers, themeId: string): Promise<Response> =>
    adminThemeDesktopPreviewResponse(defaultDb, headers, themeId),
)
