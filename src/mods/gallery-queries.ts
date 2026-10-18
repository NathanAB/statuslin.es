import { and, asc, desc, eq, ne } from 'drizzle-orm'
import type { PgDatabase, SelectedFields } from 'drizzle-orm/pg-core'
import { modDesktopPreviews, modPreviews, mods, modVersions } from '@/db/schema'
import type { GalleryItem, GalleryModCard, GallerySource } from '@/gallery/gallery-items'
import { hasAnyTag, sharedTagCount } from '@/gallery/queries'
import {
  type GallerySourceQuery,
  galleryRanking,
  limited,
  type RankedColumns,
} from '@/gallery/ranking'
import { MOD_COPY_EVENTS } from '@/gallery/trending'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import {
  desktopPreview,
  desktopPreviewColumns,
  desktopPreviewJoin,
  terminalPreviewJoin,
} from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Mods have no first-publish time, so `new` uses the mod's creation. */
const MOD_RANKING: RankedColumns = {
  id: mods.id,
  slug: mods.slug,
  status: mods.status,
  allTags: mods.allTags,
  copyCount: mods.copyCount,
  newSortTime: mods.createdAt,
  copyEvents: MOD_COPY_EVENTS,
}

/** Every mod with its current version's previews, as card rows plus `extra`; callers filter. */
function selectModCards<Extra extends SelectedFields>(db: Db, extra: Extra) {
  return db
    .select({
      modId: mods.id,
      slug: mods.slug,
      title: mods.title,
      description: mods.description,
      authorGithub: mods.authorGithub,
      copyCount: mods.copyCount,
      tags: mods.allTags,
      preview: modPreviews.segments,
      desktop: desktopPreviewColumns,
      ...extra,
    })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .leftJoin(modPreviews, terminalPreviewJoin)
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .$dynamic()
}

type ModCardRow = Omit<GalleryModCard, 'preview' | 'desktopShot'> & {
  preview: AnsiSegment[] | null
  desktop: Parameters<typeof desktopPreview>[0]
}

/** A card has no slot for a surface the mod drew nothing on. */
function modItem({ preview, desktop, ...card }: ModCardRow): GalleryItem {
  const shot = desktopPreview(desktop)
  return {
    kind: 'mod',
    card: {
      ...card,
      preview: preview && preview.length > 0 ? compactSegments(preview) : null,
      desktopShot: shot?.kind === 'shot' ? shot.card : null,
    },
  }
}

export async function getModSource(db: Db, query: GallerySourceQuery): Promise<GallerySource> {
  const ranking = galleryRanking(MOD_RANKING, query)
  const rows = await limited(
    selectModCards(db, { sortKey: ranking.sortKey, total: ranking.total })
      .where(ranking.where)
      .orderBy(...ranking.orderBy),
    query.limit,
  )
  return {
    items: rows.map(({ sortKey, total: _total, ...row }) => ({ item: modItem(row), sortKey })),
    total: rows[0]?.total ?? 0,
  }
}

/** The card of the published mod with this slug, or null when there is none. */
export async function getPublishedModCard(db: Db, slug: string): Promise<GalleryModCard | null> {
  const [row] = await selectModCards(db, {})
    .where(and(eq(mods.status, 'published'), eq(mods.slug, slug)))
    .limit(1)
  if (!row) return null
  const item = modItem(row)
  return item.kind === 'mod' ? item.card : null
}

/**
 * Up to `limit` other published mods carrying any of `mod.tags`: most shared tags first, then the
 * most copied, then by slug.
 */
export async function getModsSharingTags(
  db: Db,
  mod: { slug: string; tags: string[] },
  limit: number,
): Promise<GalleryItem[]> {
  if (mod.tags.length === 0) return []
  const rows = await selectModCards(db, {})
    .where(
      and(eq(mods.status, 'published'), ne(mods.slug, mod.slug), hasAnyTag(mods.allTags, mod.tags)),
    )
    .orderBy(desc(sharedTagCount(mods.allTags, mod.tags)), desc(mods.copyCount), asc(mods.slug))
    .limit(limit)
  return rows.map(modItem)
}
