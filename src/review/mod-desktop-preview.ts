import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { modDesktopPreviews } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { isUuid } from '@/lib/uuid'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { assertAdmin } from './admin'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Where /admin shows a mod version's Desktop shot before it is published. */
export const ADMIN_MOD_DESKTOP_PREVIEW_ROUTE = '/admin/mod-previews/$versionId/desktop.png'

/** Nothing here may be cached: not the image, and not a refusal a later admin would get. */
const UNCACHED = { 'Cache-Control': 'private, no-store' }

export function adminModDesktopPreviewPath(versionId: string): string {
  return ADMIN_MOD_DESKTOP_PREVIEW_ROUTE.replace('$versionId', versionId)
}

/**
 * Any mod version's Desktop shot, for an admin only: the public route serves a published mod's
 * current version alone, and a submission has to be reviewed before that. The bytes are untrusted
 * pixels, so nosniff keeps a browser reading them as a PNG, and nothing caches them.
 */
export async function adminModDesktopPreviewResponse(
  database: Db,
  headers: Headers,
  versionId: string,
): Promise<Response> {
  try {
    await assertAdmin(headers)
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return new Response('Forbidden', { status, headers: UNCACHED })
  }
  if (!isUuid(versionId)) return new Response('Not found', { status: 404, headers: UNCACHED })
  const [row] = await database
    .select({ png: modDesktopPreviews.png })
    .from(modDesktopPreviews)
    .where(
      and(
        eq(modDesktopPreviews.modVersionId, versionId),
        eq(modDesktopPreviews.scenarioKey, MOD_SCENARIO_KEY),
      ),
    )
  if (!row?.png) return new Response('Not found', { status: 404, headers: UNCACHED })
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

export const adminModDesktopPreviewResponseForRoute = createServerOnlyFn(
  (headers: Headers, versionId: string): Promise<Response> =>
    adminModDesktopPreviewResponse(defaultDb, headers, versionId),
)
