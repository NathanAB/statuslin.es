import { and, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { mapCardRows } from './card-rows'
import { ALL_TAG_SLUGS, FACET_BY_SLUG, FACETS, type Facet } from './facets'
import { type GalleryCard, selectCardPreviews } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface FacetStats {
  count: number
  latest: Date | null
}

interface StatsRow {
  allTags: string[] | null
  createdAt: Date
}

function facetMatches(row: StatsRow, facet: Facet): boolean {
  return (row.allTags ?? []).includes(facet.slug)
}

/**
 * Match counts + newest createdAt for every registry facet, from ONE scan of published configs.
 * The gallery is small (tens of rows); a per-facet SQL query apiece would be slower and noisier
 * than counting in JS. Drives each facet page's live/404 decision, the sitemap, and count line.
 */
export async function getFacetStats(db: Db): Promise<Map<string, FacetStats>> {
  const rows = await db
    .select({ allTags: configs.allTags, createdAt: configs.createdAt })
    .from(configs)
    .where(eq(configs.status, 'published'))
  const stats = new Map<string, FacetStats>(FACETS.map((f) => [f.slug, { count: 0, latest: null }]))
  for (const row of rows) {
    for (const facet of FACETS) {
      if (!facetMatches(row, facet)) continue
      const s = stats.get(facet.slug)
      if (!s) continue
      s.count += 1
      if (!s.latest || row.createdAt > s.latest) s.latest = row.createdAt
    }
  }
  return stats
}

/** The tag slugs at least one published config carries, in registry (display) order.
 * Drives the home filter dropdown so it never offers a tag that would match nothing. */
export async function getAvailableTags(db: Db): Promise<string[]> {
  const stats = await getFacetStats(db)
  return ALL_TAG_SLUGS.filter((slug) => (stats.get(slug)?.count ?? 0) >= 1)
}

/** A facet page's cards: published matches, most-upvoted first, newest as the tiebreak. */
export async function getFacetCards(db: Db, facet: Facet): Promise<GalleryCard[]> {
  const rows = await db
    .select({ config: configs, version: configVersions, author: user })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(
      and(
        eq(configs.status, 'published'),
        sql`${configs.allTags} @> ${JSON.stringify([facet.slug])}::jsonb`,
      ),
    )
    .orderBy(desc(configs.upvoteCount), desc(configs.createdAt))
  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )
  return mapCardRows(rows, cardPreviews)
}

/** The facet for a URL slug, or null when unknown, page:false, or zero matches (route 404s). */
export function resolveLiveFacet(slug: string, stats: Map<string, FacetStats>): Facet | null {
  const facet = FACET_BY_SLUG.get(slug)
  if (!facet?.page) return null
  return (stats.get(facet.slug)?.count ?? 0) >= 1 ? facet : null
}

/** Links for every live facet (a page facet with >= 1 match), optionally excluding the current one. */
export function liveFacetLinks(
  stats: Map<string, FacetStats>,
  excludeSlug?: string,
): Array<{ slug: string; chipLabel: string }> {
  return FACETS.filter(
    (f) => f.page && f.slug !== excludeSlug && (stats.get(f.slug)?.count ?? 0) >= 1,
  ).map((f) => ({ slug: f.slug, chipLabel: f.chipLabel }))
}
