import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modPreviews, mods, modVersions } from '@/db/schema'
import type { GallerySource } from '@/gallery/gallery-items'
import {
  type GallerySourceQuery,
  galleryRanking,
  limited,
  type RankedColumns,
} from '@/gallery/ranking'
import { MOD_COPY_EVENTS } from '@/gallery/trending'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import { MOD_SCENARIO_KEY } from './queries'

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

export async function getModSource(db: Db, query: GallerySourceQuery): Promise<GallerySource> {
  const ranking = galleryRanking(MOD_RANKING, query)
  const rows = await limited(
    db
      .select({
        modId: mods.id,
        slug: mods.slug,
        title: mods.title,
        description: mods.description,
        authorGithub: mods.authorGithub,
        copyCount: mods.copyCount,
        tags: mods.allTags,
        preview: modPreviews.segments,
        desktopScreenshot: modVersions.desktopScreenshot,
        sortKey: ranking.sortKey,
        total: ranking.total,
      })
      .from(mods)
      .innerJoin(
        modVersions,
        and(eq(modVersions.id, mods.currentVersionId), eq(modVersions.modId, mods.id)),
      )
      .leftJoin(
        modPreviews,
        and(
          eq(modPreviews.modVersionId, modVersions.id),
          eq(modPreviews.scenarioKey, MOD_SCENARIO_KEY),
        ),
      )
      .where(ranking.where)
      .orderBy(...ranking.orderBy)
      .$dynamic(),
    query.limit,
  )
  // A card has no terminal slot for a mod that drew nothing there.
  const terminal = (preview: AnsiSegment[] | null) =>
    preview && preview.length > 0 ? compactSegments(preview) : null
  return {
    items: rows.map(({ sortKey, total: _total, preview, ...card }) => ({
      item: { kind: 'mod', card: { ...card, preview: terminal(preview) } },
      sortKey,
    })),
    total: rows[0]?.total ?? 0,
  }
}
