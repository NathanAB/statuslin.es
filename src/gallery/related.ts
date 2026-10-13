import { and, desc, eq, ne, or } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import type { AnsiSegment, Interpreter } from '@/render/types'
import { galleryCardSelection, mapCardRows } from './card-rows'
import { coerceInterpreter, type GalleryCard, hasAllTags, selectCardPreviews } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface RelatedConfig {
  configId: string
  slug: string
  title: string
  interpreter: Interpreter
  copyCount: number
  preview: AnsiSegment[] | null
}

/** How many other configs a config page links to in "More status lines". */
export const RELATED_LIMIT = 6

function tagOverlap(left: string[], right: Set<string>): number {
  return left.reduce((count, tag) => count + (right.has(tag) ? 1 : 0), 0)
}

export async function getRelatedConfigs(
  db: Db,
  slug: string,
  limit = RELATED_LIMIT,
): Promise<RelatedConfig[]> {
  const [viewed] = await db
    .select({ allTags: configs.allTags })
    .from(configs)
    .where(eq(configs.slug, slug))
  const viewedTags = new Set(viewed?.allTags ?? [])

  const rows = await db
    .select({ config: configs, version: configVersions })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .where(and(eq(configs.status, 'published'), ne(configs.slug, slug)))

  const ranked = [...rows]
    .sort((a, b) => {
      const overlapDelta =
        tagOverlap(b.config.allTags ?? [], viewedTags) -
        tagOverlap(a.config.allTags ?? [], viewedTags)
      if (overlapDelta !== 0) return overlapDelta
      if (b.config.copyCount !== a.config.copyCount) return b.config.copyCount - a.config.copyCount
      return b.config.createdAt.getTime() - a.config.createdAt.getTime()
    })
    .slice(0, limit)

  const cardPreviews = await selectCardPreviews(
    db,
    ranked.map((r) => r.version.contentSha256),
  )

  return ranked.map((r) => ({
    configId: r.config.id,
    slug: r.config.slug,
    title: r.version.title,
    interpreter: coerceInterpreter(r.version.interpreter),
    copyCount: r.config.copyCount,
    preview: cardPreviews.get(r.version.contentSha256) ?? null,
  }))
}

/** The items that share a tag with `tags`, most shared tags first; ties keep their order. */
export function bySharedTags<T>(items: T[], tags: string[], tagsOf: (item: T) => string[]): T[] {
  const wanted = new Set(tags)
  return items
    .map((item) => ({ item, overlap: tagOverlap(tagsOf(item), wanted) }))
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map(({ item }) => item)
}

/**
 * Up to `limit` published status lines carrying any of `tags`: most shared tags first, then the
 * most copied, then the newest. For a mod page, since src/gallery cannot query mods.
 */
export async function getConfigsSharingTags(
  db: Db,
  tags: string[],
  limit: number,
): Promise<GalleryCard[]> {
  const rows = await db
    .select(galleryCardSelection)
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(
      and(
        eq(configs.status, 'published'),
        or(...tags.map((tag) => hasAllTags(configs.allTags, [tag]))),
      ),
    )
    .orderBy(desc(configs.copyCount), desc(configs.createdAt))
  const ranked = bySharedTags(rows, tags, (row) => row.config.allTags ?? []).slice(0, limit)
  const cardPreviews = await selectCardPreviews(
    db,
    ranked.map((row) => row.version.contentSha256),
  )
  return mapCardRows(ranked, cardPreviews)
}
