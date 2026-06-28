import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, previews, user } from '@/db/schema'
import { getVoteState } from '@/lib/vote-state'
import { getPreviews } from '@/render/store'
import {
  type AnsiSegment,
  INTERPRETERS,
  type Interpreter,
  type RenderedPreview,
} from '@/render/types'

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
  return 'new'
}

/** Narrows a URL `?page=` value to a 1-based page number; anything invalid falls back to 1. */
export function coercePage(value: unknown): number {
  const n =
    typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

const VALID_INTERPRETERS = new Set<Interpreter>(INTERPRETERS)

/** Narrows the free-form DB `interpreter` column to the Interpreter union; falls back to 'bash'. */
export function coerceInterpreter(value: string): Interpreter {
  return VALID_INTERPRETERS.has(value as Interpreter) ? (value as Interpreter) : 'bash'
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
  usesNetwork: boolean
}

/** Total published configs — drives the gallery's page count. */
export async function getPublishedCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(configs)
    .where(eq(configs.status, 'published'))
  return row?.n ?? 0
}

export async function getPublishedConfigs(
  db: Db,
  sort: GallerySort = 'new',
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
    .orderBy(orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  // One batched query for every card's preview instead of one lookup per card (the N+1). Select
  // only `segments` — the card never shows rawStdout or the behavior trace, so pulling them (the
  // big text/jsonb columns) would be wasted bytes on every gallery hit.
  const cardPreviews = await selectCardPreviews(
    db,
    rows.map((r) => r.version.contentSha256),
  )

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
    usesNetwork: (r.version.networkHosts ?? []).length > 0,
  }))
}

/**
 * Fetch the card preview (the `clean-main` scenario, falling back to any one scenario) for a set of
 * script hashes in a single query, returning a sha → segments map. Replaces the per-card lookup
 * that made the gallery an N+1; selects only `segments` since that's all the card renders.
 */
async function selectCardPreviews(db: Db, shas: string[]): Promise<Map<string, AnsiSegment[]>> {
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
  upvoteCount: number
  copyCount: number
  author: ConfigAuthor | null
  hasVoted: boolean
  source: string
  /** Pre-highlighted HTML of `source`, or null when not yet computed (read path highlights live). */
  sourceHtml: string | null
  contentSha256: string
  networkHosts: string[]
  previews: RenderedPreview[]
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
    previews,
  }
}
