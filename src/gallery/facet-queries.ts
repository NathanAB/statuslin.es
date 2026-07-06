import { and, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { mapCardRows } from './card-rows'
import { FACET_BY_SLUG, FACETS, type Facet, MIN_FACET_CONFIGS } from './facets'
import { type GalleryCard, selectCardPreviews } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface FacetStats {
  count: number
  latest: Date | null
}

interface StatsRow {
  tags: string[] | null
  interpreter: string
  createdAt: Date
}

function facetMatches(row: StatsRow, facet: Facet): boolean {
  if (facet.kind === 'interpreter') return row.interpreter === facet.interpreter
  return (row.tags ?? []).includes(facet.slug)
}

/**
 * Match counts + newest createdAt for every registry facet, from ONE scan of published configs.
 * The gallery is small (tens of rows); a per-facet SQL query apiece would be slower and noisier
 * than counting in JS. Drives the 3-config rule, the sitemap, and each page's count line.
 */
export async function getFacetStats(db: Db): Promise<Map<string, FacetStats>> {
  const rows = await db
    .select({ tags: configs.tags, interpreter: configs.interpreter, createdAt: configs.createdAt })
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

/** A facet page's cards: published matches, most-upvoted first, newest as the tiebreak. */
export async function getFacetCards(db: Db, facet: Facet): Promise<GalleryCard[]> {
  const facetFilter =
    facet.kind === 'interpreter'
      ? eq(configs.interpreter, facet.interpreter as string)
      : sql`${configs.tags} @> ${JSON.stringify([facet.slug])}::jsonb`
  const rows = await db
    .select({ config: configs, version: configVersions, author: user })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(and(eq(configs.status, 'published'), facetFilter))
    .orderBy(desc(configs.upvoteCount), desc(configs.createdAt))
  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )
  return mapCardRows(rows, cardPreviews)
}

/** The facet for a URL slug, or null when unknown or under MIN_FACET_CONFIGS (route 404s). */
export function resolveLiveFacet(slug: string, stats: Map<string, FacetStats>): Facet | null {
  const facet = FACET_BY_SLUG.get(slug)
  if (!facet) return null
  const count = stats.get(facet.slug)?.count ?? 0
  return count >= MIN_FACET_CONFIGS ? facet : null
}

/** Links for every live facet (>= MIN_FACET_CONFIGS), optionally excluding the current one. */
export function liveFacetLinks(
  stats: Map<string, FacetStats>,
  excludeSlug?: string,
): Array<{ slug: string; chipLabel: string }> {
  return FACETS.filter(
    (f) => f.slug !== excludeSlug && (stats.get(f.slug)?.count ?? 0) >= MIN_FACET_CONFIGS,
  ).map((f) => ({ slug: f.slug, chipLabel: f.chipLabel }))
}
