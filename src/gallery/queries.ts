import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { GeneratedContent } from '@/content/types'
import { configs, configVersions, previews, user } from '@/db/schema'
import { getVoteState } from '@/lib/vote-state'
import { getPreviews } from '@/render/store'
import type { AnsiSegment, Interpreter, RenderedPreview } from '@/render/types'
import { coerceInterpreter, mapCardRows } from './card-rows'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Cards per gallery page. */
export const PAGE_SIZE = 10
/** The scenario shown on a gallery card; falls back to the first available preview. */
const CARD_SCENARIO = 'clean-main'

export type GallerySort = 'new' | 'top' | 'trending'

const VALID_SORTS = new Set<GallerySort>(['new', 'top', 'trending'])

export function coerceSort(value: unknown): GallerySort {
  if (typeof value === 'string' && VALID_SORTS.has(value as GallerySort)) {
    return value as GallerySort
  }
  return 'trending'
}

/** Narrows a URL `?page=` value to a 1-based page number; anything invalid falls back to 1. */
export function coercePage(value: unknown): number {
  const n =
    typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export interface ConfigAuthor {
  name: string
  username: string | null
  image: string | null
}

export interface GalleryCard {
  slug: string
  title: string
  description: string
  interpreter: Interpreter
  upvoteCount: number
  copyCount: number
  author: ConfigAuthor | null
  preview: AnsiSegment[] | null
  networkHosts: string[]
  readsClaudeToken: boolean
}

/** Total published configs — drives the gallery's page count. */
export async function getPublishedCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(configs)
    .where(eq(configs.status, 'published'))
  return row?.n ?? 0
}

/**
 * Every published config's slug + createdAt, newest first — the minimal columns the sitemap
 * needs. Deliberately unpaginated and join-free (the sitemap lists all configs, not a page),
 * so it stays a single index-covered scan over `(status, created_at)`.
 */
export async function getPublishedSlugsForSitemap(
  db: Db,
): Promise<Array<{ slug: string; createdAt: Date }>> {
  return db
    .select({ slug: configs.slug, createdAt: configs.createdAt })
    .from(configs)
    .where(eq(configs.status, 'published'))
    .orderBy(desc(configs.createdAt))
}

export async function getPublishedConfigs(
  db: Db,
  sort: GallerySort = 'trending',
  page = 1,
): Promise<GalleryCard[]> {
  const orderBy =
    sort === 'top'
      ? desc(configs.upvoteCount)
      : sort === 'trending'
        ? sql`${configs.copyCount} / power(extract(epoch from (now() - ${configs.createdAt})) / 3600 + 2, 1.5) desc`
        : desc(configs.createdAt)

  const rows = await db
    .select({ config: configs, version: configVersions, author: user })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(eq(configs.status, 'published'))
    // createdAt tiebreak: zero-copy configs all score 0 on trending — without it, the default
    // gallery order would be database-arbitrary.
    .orderBy(orderBy, desc(configs.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  // One batched query for every card's preview instead of one lookup per card (the N+1). Select
  // only `segments` — the card never shows rawStdout or the behavior trace, so pulling them (the
  // big text/jsonb columns) would be wasted bytes on every gallery hit.
  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )

  return mapCardRows(rows, cardPreviews)
}

/**
 * Fetch the card preview (the `clean-main` scenario, falling back to any one scenario) for a set of
 * script hashes in a single query, returning a sha → segments map. Replaces the per-card lookup
 * that made the gallery an N+1; selects only `segments` since that's all the card renders.
 */
export async function selectCardPreviews(
  db: Db,
  shas: string[],
): Promise<Map<string, AnsiSegment[]>> {
  const bySha = new Map<string, AnsiSegment[]>()
  if (shas.length === 0) return bySha
  const rows = await db
    .select({
      scriptSha: previews.scriptSha,
      scenarioKey: previews.scenarioKey,
      segments: previews.segments,
    })
    .from(previews)
    .where(inArray(previews.scriptSha, shas))
  for (const row of rows) {
    const segments = row.segments as AnsiSegment[]
    // clean-main always wins; otherwise keep the first scenario seen for this sha.
    if (row.scenarioKey === CARD_SCENARIO || !bySha.has(row.scriptSha)) {
      bySha.set(row.scriptSha, segments)
    }
  }
  return bySha
}

export interface ConfigDetail {
  id: string
  slug: string
  title: string
  description: string
  interpreter: Interpreter
  tags: string[]
  upvoteCount: number
  copyCount: number
  author: ConfigAuthor | null
  hasVoted: boolean
  source: string
  /** Pre-highlighted HTML of `source`, or null when not yet computed (read path highlights live). */
  sourceHtml: string | null
  contentSha256: string
  networkHosts: string[]
  readsClaudeToken: boolean
  /** Auto-generated page copy, or null when scripts/generate-content.ts hasn't run for this version. */
  generatedContent: GeneratedContent | null
  previews: RenderedPreview[]
  /** SPDX license of third-party (seeded) source, e.g. 'MIT'. Null = submitter's own work (CC0 per terms). */
  license: string | null
  /** Permanent link to the upstream source at the pinned revision (seeded configs only). */
  sourceUrl: string | null
}

export async function getConfigBySlug(
  db: Db,
  slug: string,
  userId?: string,
): Promise<ConfigDetail | null> {
  const [row] = await db
    .select({ config: configs, version: configVersions, author: user })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(and(eq(configs.slug, slug), eq(configs.status, 'published')))
    .limit(1)
  if (!row) return null
  const previews = await getPreviews(db, row.version.contentSha256)
  const hasVoted = userId ? await getVoteState(db, userId, row.config.id) : false
  return {
    id: row.config.id,
    slug: row.config.slug,
    title: row.config.title,
    description: row.config.description,
    interpreter: coerceInterpreter(row.config.interpreter),
    tags: row.config.tags ?? [],
    upvoteCount: row.config.upvoteCount,
    copyCount: row.config.copyCount,
    author: row.author
      ? {
          name: row.author.name,
          username: row.author.username ?? null,
          image: row.author.image ?? null,
        }
      : null,
    hasVoted,
    source: row.version.source,
    sourceHtml: row.version.sourceHtml,
    contentSha256: row.version.contentSha256,
    networkHosts: row.version.networkHosts ?? [],
    readsClaudeToken: row.version.readsClaudeToken ?? false,
    generatedContent: row.version.generatedContent ?? null,
    previews,
    license: row.version.license ?? null,
    sourceUrl: row.version.sourceUrl ?? null,
  }
}

export { coerceInterpreter } from './card-rows'
export type { FacetStats } from './facet-queries'
export { getFacetCards, getFacetStats, liveFacetLinks, resolveLiveFacet } from './facet-queries'
// Re-exported so @/gallery/queries stays the single import surface for gallery
// queries (related.ts exists only to respect the 250-line file gate).
export type { RelatedConfig } from './related'
export { getRelatedConfigs, RELATED_LIMIT } from './related'
