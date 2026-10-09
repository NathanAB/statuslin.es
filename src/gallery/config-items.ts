import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { galleryCardSelection, mapCardRow } from './card-rows'
import type { GallerySource } from './gallery-items'
import { type GalleryCard, type GallerySort, PAGE_SIZE, selectCardPreviews } from './queries'
import { type GallerySourceQuery, galleryRanking, limited, type RankedColumns } from './ranking'
import { CONFIG_COPY_EVENTS } from './trending'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** `new` uses the first publish, so an approved update keeps its place. */
const CONFIG_RANKING: RankedColumns = {
  id: configs.id,
  slug: configs.slug,
  status: configs.status,
  allTags: configs.allTags,
  copyCount: configs.copyCount,
  publishedAt: configs.firstPublishedAt,
  copyEvents: CONFIG_COPY_EVENTS,
}

async function selectRankedCards(
  db: Db,
  query: GallerySourceQuery & { offset?: number },
): Promise<{ cards: Array<{ card: GalleryCard; sortKey: number | null }>; total: number }> {
  const ranking = galleryRanking(CONFIG_RANKING, query)
  const rows = await limited(
    db
      .select({ ...galleryCardSelection, sortKey: ranking.sortKey, total: ranking.total })
      .from(configs)
      .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
      .leftJoin(user, eq(user.id, configs.authorId))
      .where(ranking.where)
      .orderBy(...ranking.orderBy)
      .offset(query.offset ?? 0)
      .$dynamic(),
    query.limit,
  )
  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )
  return {
    cards: rows.map((row) => ({ card: mapCardRow(row, cardPreviews), sortKey: row.sortKey })),
    total: rows[0]?.total ?? 0,
  }
}

export async function getPublishedConfigs(
  db: Db,
  sort: GallerySort = 'trending',
  page = 1,
  tags: string[] = [],
): Promise<GalleryCard[]> {
  const { cards } = await selectRankedCards(db, {
    sort,
    tags,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  return cards.map(({ card }) => card)
}

/** Published configs as one gallery source: the first `limit` in sort order, and the total. */
export async function getConfigSource(db: Db, query: GallerySourceQuery): Promise<GallerySource> {
  const { cards, total } = await selectRankedCards(db, query)
  return {
    items: cards.map(({ card, sortKey }) => ({ item: { kind: 'status-line', card }, sortKey })),
    total,
  }
}
