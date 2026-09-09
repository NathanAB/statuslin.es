import { and, eq, ne } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions } from '@/db/schema'
import type { AnsiSegment, Interpreter } from '@/render/types'
import { coerceInterpreter, selectCardPreviews } from './queries'

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
    title: r.config.title,
    interpreter: coerceInterpreter(r.config.interpreter),
    copyCount: r.config.copyCount,
    preview: cardPreviews.get(r.version.contentSha256) ?? null,
  }))
}
