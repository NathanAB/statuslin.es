import type { configs, configVersions, user } from '@/db/schema'
import { type AnsiSegment, INTERPRETERS, type Interpreter } from '@/render/types'
import type { GalleryCard } from './queries'

const VALID_INTERPRETERS = new Set<Interpreter>(INTERPRETERS)

/** Narrows the free-form DB `interpreter` column to the Interpreter union; falls back to 'bash'. */
export function coerceInterpreter(value: string): Interpreter {
  return VALID_INTERPRETERS.has(value as Interpreter) ? (value as Interpreter) : 'bash'
}

/** Shared row → GalleryCard mapping for the home gallery and facet pages. */
export function mapCardRows(
  rows: Array<{
    config: typeof configs.$inferSelect
    version: typeof configVersions.$inferSelect
    author: typeof user.$inferSelect | null
  }>,
  cardPreviews: Map<string, AnsiSegment[]>,
): GalleryCard[] {
  return rows.map((r) => ({
    slug: r.config.slug,
    title: r.config.title,
    description: r.config.description,
    interpreter: coerceInterpreter(r.config.interpreter),
    upvoteCount: r.config.upvoteCount,
    copyCount: r.config.copyCount,
    author: r.author
      ? {
          name: r.author.name,
          username: r.author.username ?? null,
          image: r.author.image ?? null,
        }
      : null,
    preview: cardPreviews.get(r.version.contentSha256) ?? null,
    networkHosts: r.version.networkHosts ?? [],
    readsClaudeToken: r.version.readsClaudeToken ?? false,
    tags: r.config.allTags ?? [],
  }))
}
