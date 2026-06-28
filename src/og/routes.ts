import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { getConfigBySlug } from '@/gallery/queries'
import { configCard, homeCard } from '@/og/card'
import { toElementPng } from '@/og/render'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver; query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

// The home card never changes within a process — render once, then reuse the bytes.
let homePngCache: Uint8Array | null = null

async function homePngBytes(): Promise<Uint8Array> {
  if (!homePngCache) homePngCache = await toElementPng(homeCard())
  return homePngCache
}

function pngResponse(bytes: Uint8Array, cacheControl: string): Response {
  // Blob accepts the typed array directly (BlobPart), so we don't rely on bytes.buffer being the
  // exact PNG — a subarray view would otherwise leak its whole backing buffer into the response.
  return new Response(new Blob([bytes as BufferSource]), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl },
  })
}

export async function homeCardResponse(): Promise<Response> {
  // The home image really is immutable — its own URL can cache for a year.
  return pngResponse(await homePngBytes(), 'public, max-age=31536000, immutable')
}

/** Per-config card. Unknown/unpublished slug → the home card BYTES but with the SHORT (1h) cache,
 * never the immutable one: this URL is keyed to a slug that may publish later, and a cached
 * fallback must expire so scrapers refetch the real card once it exists. A known slug also gets 1h
 * (a config can update to a new version). Always 200 — a shared link never 404s a scraper. */
export async function configCardResponse(db: Db, slug: string): Promise<Response> {
  const detail = await getConfigBySlug(db, slug)
  if (!detail) return pngResponse(await homePngBytes(), 'public, max-age=3600')
  const author = detail.author?.username
    ? `@${detail.author.username}`
    : (detail.author?.name ?? null)
  const png = await toElementPng(
    configCard({ title: detail.title, author, previews: detail.previews }),
  )
  return pngResponse(png, 'public, max-age=3600')
}

/** Route-level wrapper: uses the real production db so route files don't import @/db directly
 * (the routes-no-direct-db boundary rule). Tests use configCardResponse(db, slug) with
 * an injected PGlite db instead. */
export async function configCardResponseForRoute(slug: string): Promise<Response> {
  return configCardResponse(defaultDb, slug)
}
