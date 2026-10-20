import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, previews, user } from '@/db/schema'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import { CONFIG_RANKING } from './config-items'
import type { ConfigAuthor } from './queries'
import { galleryRanking } from './ranking'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How many status lines the home hero lets a visitor try. */
export const HERO_SIZE = 8

/** The sessions the hero switches between, as scenario keys (src/render/scenarios.ts), in order. */
export const HERO_SESSION_KEYS = [
  'clean-main',
  'fresh-session',
  'dirty-feature',
  'big-context',
] as const
export type HeroSessionKey = (typeof HERO_SESSION_KEYS)[number]

/** A status line the hero can show: what it names, and its render for each hero session. */
export interface HeroLine {
  configId: string
  slug: string
  title: string
  copyCount: number
  author: ConfigAuthor | null
  /** What the script can reach, said under the hero's install button. */
  networkHosts: string[]
  readsClaudeToken: boolean
  /** A session with no render yet is left out. */
  renders: Partial<Record<HeroSessionKey, AnsiSegment[]>>
}

/**
 * The home hero's status lines: the first HERO_SIZE the home gallery ranks (Trending), each with
 * its renders for the four hero sessions. The gallery's own query loads one render per card; this
 * one is the hero's alone, about 4.5KB a line.
 */
export async function getHeroLines(db: Db): Promise<HeroLine[]> {
  const ranking = galleryRanking(CONFIG_RANKING, { sort: 'trending' })
  const rows = await db
    .select({
      configId: configs.id,
      slug: configs.slug,
      copyCount: configs.copyCount,
      title: configVersions.title,
      sha: configVersions.contentSha256,
      networkHosts: configVersions.networkHosts,
      readsClaudeToken: configVersions.readsClaudeToken,
      author: { name: user.name, username: user.username, image: user.image },
    })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(ranking.where)
    .orderBy(...ranking.orderBy)
    .limit(HERO_SIZE)
  if (rows.length === 0) return []

  const rendered = await db
    .select({
      sha: previews.scriptSha,
      scenarioKey: previews.scenarioKey,
      segments: previews.segments,
    })
    .from(previews)
    .where(
      and(
        inArray(
          previews.scriptSha,
          rows.map((row) => row.sha),
        ),
        inArray(previews.scenarioKey, [...HERO_SESSION_KEYS]),
      ),
    )
  const rendersBySha = new Map<string, HeroLine['renders']>()
  for (const { sha, scenarioKey, segments } of rendered) {
    const renders = rendersBySha.get(sha) ?? {}
    renders[scenarioKey as HeroSessionKey] = compactSegments(segments as AnsiSegment[])
    rendersBySha.set(sha, renders)
  }

  return rows.map(({ sha, author, networkHosts, readsClaudeToken, ...row }) => ({
    ...row,
    networkHosts: networkHosts ?? [],
    readsClaudeToken: readsClaudeToken ?? false,
    author: author
      ? { name: author.name, username: author.username ?? null, image: author.image ?? null }
      : null,
    renders: rendersBySha.get(sha) ?? {},
  }))
}
