import { and, asc, eq, type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgSelect } from 'drizzle-orm/pg-core'
import { coercePage, coerceSort, coerceTags, type GallerySort, hasAllTags } from './queries'
import { type CopyEventColumns, trendingScore } from './trending'

export interface GallerySourceQuery {
  sort: GallerySort
  tags?: string[]
  limit?: number
}

export interface RankedColumns {
  id: PgColumn
  slug: PgColumn
  status: PgColumn
  allTags: PgColumn
  copyCount: PgColumn
  newSortTime: PgColumn
  copyEvents: CopyEventColumns
}

const SORT_KEYS: Record<GallerySort, (columns: RankedColumns) => SQL> = {
  top: (columns) => sql`${columns.copyCount}`,
  trending: (columns) => trendingScore(columns.id, columns.copyEvents),
  new: (columns) => sql`extract(epoch from ${columns.newSortTime})`,
}

/**
 * The sort key, filter and order every gallery kind uses, so status lines and mods rank on one
 * scale. `total` counts every match before the limit; read it from any returned row.
 */
export function galleryRanking(columns: RankedColumns, query: GallerySourceQuery) {
  const sortKey = sql<number | null>`(${SORT_KEYS[query.sort](columns)})::float8`
  return {
    sortKey,
    total: sql<number>`(count(*) over ())::int`,
    where: and(eq(columns.status, 'published'), hasAllTags(columns.allTags, query.tags ?? [])),
    orderBy: [sql`${sortKey} desc nulls last`, asc(columns.slug)] as const,
  }
}

export function limited<T extends PgSelect>(select: T, limit: number | undefined): T {
  return limit === undefined ? select : select.limit(limit)
}

/** Server-fn input is untrusted. */
export function coerceSourceQuery(query: GallerySourceQuery): GallerySourceQuery {
  return {
    sort: coerceSort(query.sort),
    tags: coerceTags(Array.isArray(query.tags) ? query.tags.join(',') : undefined),
    ...(query.limit === undefined ? {} : { limit: coercePage(query.limit) }),
  }
}
