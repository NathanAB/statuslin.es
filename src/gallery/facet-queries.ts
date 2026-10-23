import { and, desc, eq, max, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, copyEvents, submissions, user } from '@/db/schema'
import { galleryCardSelection, mapCardRows } from './card-rows'
import { facetTopicName } from './facet-page-copy'
import { FACET_BY_SLUG, FACETS, type Facet } from './facets'
import { type GalleryCard, selectCardPreviews } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Minimum published inventory before a facet is surfaced to crawlers and cross-facet discovery. */
export const MIN_INDEXABLE_FACET_CONFIGS = 3

/** A published mod as facet stats see it. `updatedAt` is its current version's date, when known. */
export interface FacetMod {
  tags: string[]
  updatedAt?: Date
}

export interface FacetStats {
  count: number
  latest: Date | null
}

interface StatsRow {
  allTags: string[] | null
  createdAt: Date
  reviewedAt: Date | null
}

function facetMatches(row: StatsRow, facet: Facet): boolean {
  return (row.allTags ?? []).includes(facet.slug)
}

function countMatch(s: FacetStats, updatedAt: Date | undefined): void {
  s.count += 1
  if (updatedAt && (!s.latest || updatedAt > s.latest)) s.latest = updatedAt
}

/**
 * Match counts + newest effective update date for every registry facet, from ONE scan of
 * published configs joined to their current versions. The gallery is small (tens of rows); a
 * per-facet SQL query apiece would be slower and noisier than counting in JS. Drives each facet
 * page's live/404 decision, the sitemap, and count line. `mods` holds each published mod;
 * src/gallery cannot query mods, so the caller passes them in. They add to the counts and dates.
 */
export async function getFacetStats(
  db: Db,
  mods: FacetMod[] = [],
): Promise<Map<string, FacetStats>> {
  const rows = await db
    .select({
      allTags: configs.allTags,
      createdAt: configs.createdAt,
      reviewedAt: submissions.reviewedAt,
    })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(submissions, eq(submissions.configVersionId, configVersions.id))
    .where(eq(configs.status, 'published'))
  const stats = new Map<string, FacetStats>(FACETS.map((f) => [f.slug, { count: 0, latest: null }]))
  for (const row of rows) {
    for (const facet of FACETS) {
      if (!facetMatches(row, facet)) continue
      const s = stats.get(facet.slug)
      if (s) countMatch(s, row.reviewedAt ?? row.createdAt)
    }
  }
  addModMatches(stats, mods)
  return stats
}

function addModMatches(stats: Map<string, FacetStats>, mods: FacetMod[]): void {
  for (const mod of mods) {
    for (const tag of new Set(mod.tags)) {
      const s = stats.get(tag)
      if (s) countMatch(s, mod.updatedAt)
    }
  }
}

/** A facet page's cards: published matches, most-copied first, newest as the tiebreak. */
export function getFacetCards(db: Db, facet: Facet): Promise<GalleryCard[]> {
  return getCardsByCopies(db, { tag: facet.slug })
}

export async function getCardsByCopies(
  db: Db,
  options: { tag?: string; limit?: number } = {},
): Promise<GalleryCard[]> {
  const tagFilter = options.tag
    ? sql`${configs.allTags} @> ${JSON.stringify([options.tag])}::jsonb`
    : undefined
  const query = db
    .select(galleryCardSelection)
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(and(eq(configs.status, 'published'), tagFilter))
    .orderBy(desc(configs.copyCount), desc(configs.createdAt))
  const rows = await (options.limit === undefined ? query : query.limit(options.limit))
  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )
  return mapCardRows(rows, cardPreviews)
}

/** When a published config was last copied: the date the copy ranking last changed, or null. */
export async function getLatestCopyAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ latest: max(copyEvents.createdAt) })
    .from(copyEvents)
    .innerJoin(configs, eq(configs.id, copyEvents.configId))
    .where(eq(configs.status, 'published'))
  return row?.latest ?? null
}

/** The facet for a URL slug, or null when unknown, page:false, or zero matches (route 404s). */
export function resolveLiveFacet(slug: string, stats: Map<string, FacetStats>): Facet | null {
  const facet = FACET_BY_SLUG.get(slug)
  if (!facet?.page) return null
  return (stats.get(facet.slug)?.count ?? 0) >= 1 ? facet : null
}

/** Whether a known facet has enough published inventory to be indexed and promoted. */
export function isIndexableFacet(slug: string, stats: Map<string, FacetStats>): boolean {
  return (stats.get(slug)?.count ?? 0) >= MIN_INDEXABLE_FACET_CONFIGS
}

/** A status line's first indexable topic, with the short name its breadcrumb shows: "Git". */
export function primaryFacet(
  tags: string[],
  stats: Map<string, FacetStats>,
): { slug: string; topic: string } | null {
  for (const slug of tags) {
    const facet = FACET_BY_SLUG.get(slug)
    if (facet?.page && isIndexableFacet(slug, stats)) {
      return { slug, topic: facetTopicName(facet) }
    }
  }
  return null
}

/** Links for every indexable facet, optionally excluding the current one. */
export function liveFacetLinks(
  stats: Map<string, FacetStats>,
  excludeSlug?: string,
): Array<{ slug: string; chipLabel: string }> {
  return FACETS.filter(
    (f) => f.page && f.slug !== excludeSlug && isIndexableFacet(f.slug, stats),
  ).map((f) => ({ slug: f.slug, chipLabel: f.chipLabel }))
}
