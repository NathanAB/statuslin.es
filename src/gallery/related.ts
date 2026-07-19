import { and, desc, eq, ne } from 'drizzle-orm'
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
  upvoteCount: number
  preview: AnsiSegment[] | null
}

/** How many other configs a config page links to in "More status lines". */
export const RELATED_LIMIT = 6

/**
 * Other published configs for the "More status lines" section on a config page —
 * top-voted first (ties broken by newest), excluding the config being viewed.
 * Exists for internal linking: without it every config page is a crawl dead end.
 */
export async function getRelatedConfigs(
  db: Db,
  slug: string,
  limit = RELATED_LIMIT,
): Promise<RelatedConfig[]> {
  const rows = await db
    .select({ config: configs, version: configVersions })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .where(and(eq(configs.status, 'published'), ne(configs.slug, slug)))
    .orderBy(desc(configs.upvoteCount), desc(configs.createdAt))
    .limit(limit)

  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )

  return rows.map((r) => ({
    configId: r.config.id,
    slug: r.config.slug,
    title: r.config.title,
    interpreter: coerceInterpreter(r.config.interpreter),
    upvoteCount: r.config.upvoteCount,
    preview: cardPreviews.get(r.version.contentSha256) ?? null,
  }))
}
