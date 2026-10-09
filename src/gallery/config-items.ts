import { and, asc, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { galleryCardSelection, mapCardRows } from './card-rows'
import type { GallerySource } from './gallery-items'
import {
  type GalleryCard,
  type GallerySort,
  getPublishedCount,
  hasAllTags,
  PAGE_SIZE,
  selectCardPreviews,
} from './queries'
import { CONFIG_COPY_EVENTS, trendingScore } from './trending'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** `new` uses the first publish, so an approved update keeps its place. */
const SORT_KEYS: Record<GallerySort, SQL> = {
  top: sql`${configs.copyCount}`,
  trending: trendingScore(configs.id, CONFIG_COPY_EVENTS),
  new: sql`extract(epoch from ${configs.firstPublishedAt})`,
}

async function selectRankedCards(
  db: Db,
  query: { sort: GallerySort; tags: string[]; limit?: number; offset?: number },
): Promise<Array<{ card: GalleryCard; sortKey: number | null }>> {
  const sortKey = sql<number | null>`(${SORT_KEYS[query.sort]})::float8`
  const rowsQuery = db
    .select({ ...galleryCardSelection, sortKey })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(and(eq(configs.status, 'published'), hasAllTags(configs.allTags, query.tags)))
    .orderBy(sql`${sortKey} desc nulls last`, asc(configs.slug))
    .offset(query.offset ?? 0)
    .$dynamic()
  const rows = await (query.limit === undefined ? rowsQuery : rowsQuery.limit(query.limit))

  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )
  const cards = mapCardRows(rows, cardPreviews)
  return cards.map((card, i) => ({ card, sortKey: rows[i]?.sortKey ?? null }))
}

export async function getPublishedConfigs(
  db: Db,
  sort: GallerySort = 'trending',
  page = 1,
  tags: string[] = [],
): Promise<GalleryCard[]> {
  const ranked = await selectRankedCards(db, {
    sort,
    tags,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  return ranked.map(({ card }) => card)
}

/** Published configs as one gallery source: the first `limit` in sort order, and the total. */
export async function getConfigSource(
  db: Db,
  query: { sort: GallerySort; tags?: string[]; limit?: number },
): Promise<GallerySource> {
  const tags = query.tags ?? []
  const [ranked, total] = await Promise.all([
    selectRankedCards(db, { ...query, tags }),
    getPublishedCount(db, tags),
  ])
  return {
    items: ranked.map(({ card, sortKey }) => ({ item: { kind: 'status-line', card }, sortKey })),
    total,
  }
}
