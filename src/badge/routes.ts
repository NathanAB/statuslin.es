import type { PgDatabase } from 'drizzle-orm/pg-core'
import { badgeSvg } from '@/badge/badge'
import { db as defaultDb } from '@/db'
import { getConfigBySlug } from '@/gallery/queries'
import { getModDetail } from '@/mods/queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver; query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

// The count moves with every install; an hour keeps GitHub's image proxy from asking on every view.
const BADGE_CACHE = 'public, max-age=3600'

// Opened directly, the badge is a page. badge-maker draws with presentation attributes only, so
// it needs nothing loaded or inlined; any script or style a future change adds stays blocked.
const BADGE_CSP = "default-src 'none'"

function badgeResponse(copyCount: number | null): Response {
  if (copyCount === null) return new Response('Not found', { status: 404 })
  return new Response(badgeSvg(copyCount), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': BADGE_CACHE,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': BADGE_CSP,
    },
  })
}

/** A published status line's badge. A draft, removed or unknown slug is a 404: no listing, no badge. */
export async function configBadgeResponse(db: Db, slug: string): Promise<Response> {
  return badgeResponse((await getConfigBySlug(db, slug))?.copyCount ?? null)
}

/** A published mod's badge, a 404 otherwise. An unreviewed mod has no slug here, so no badge. */
export async function modBadgeResponse(db: Db, slug: string): Promise<Response> {
  return badgeResponse((await getModDetail(db, slug))?.copyCount ?? null)
}

/** Route-level wrappers on the production db, since route files must not import @/db. */
export async function configBadgeResponseForRoute(slug: string): Promise<Response> {
  return configBadgeResponse(defaultDb, slug)
}

export async function modBadgeResponseForRoute(slug: string): Promise<Response> {
  return modBadgeResponse(defaultDb, slug)
}
