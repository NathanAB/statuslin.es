import { and, asc, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modCopyEvents, modPreviews, mods, modVersions } from '@/db/schema'
import type { GallerySource } from '@/gallery/gallery-items'
import { type GallerySort, hasAllTags } from '@/gallery/queries'
import { trendingScore } from '@/gallery/trending'
import { compactSegments } from '@/render/compact-segments'
import { MOD_SCENARIO_KEY } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * On the same scale as a config's keys so the two kinds merge. Mods have no first-publish time, so
 * `new` uses the mod's creation.
 */
const SORT_KEYS: Record<GallerySort, SQL> = {
  top: sql`${mods.copyCount}`,
  trending: trendingScore(mods.id, {
    ownerId: modCopyEvents.modId,
    createdAt: modCopyEvents.createdAt,
  }),
  new: sql`extract(epoch from ${mods.createdAt})`,
}

/** Published mods as one gallery source: the first `limit` in sort order, and the total. */
export async function getModSource(
  db: Db,
  query: { sort: GallerySort; tags?: string[]; limit?: number },
): Promise<GallerySource> {
  const published = and(eq(mods.status, 'published'), hasAllTags(mods.allTags, query.tags ?? []))
  const currentVersion = and(
    eq(modVersions.id, mods.currentVersionId),
    eq(modVersions.modId, mods.id),
  )
  const sortKey = sql<number | null>`(${SORT_KEYS[query.sort]})::float8`
  const rowsQuery = db
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
      sortKey,
    })
    .from(mods)
    .innerJoin(modVersions, currentVersion)
    .leftJoin(
      modPreviews,
      and(
        eq(modPreviews.modVersionId, modVersions.id),
        eq(modPreviews.scenarioKey, MOD_SCENARIO_KEY),
      ),
    )
    .where(published)
    .orderBy(sql`${sortKey} desc nulls last`, asc(mods.slug))
    .$dynamic()
  const [rows, [count]] = await Promise.all([
    query.limit === undefined ? rowsQuery : rowsQuery.limit(query.limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(mods)
      .innerJoin(modVersions, currentVersion)
      .where(published),
  ])
  return {
    items: rows.map(({ sortKey, preview, ...card }) => ({
      item: {
        kind: 'mod',
        card: { ...card, preview: preview ? compactSegments(preview) : null },
      },
      sortKey,
    })),
    total: count?.n ?? 0,
  }
}
