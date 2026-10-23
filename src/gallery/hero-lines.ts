import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configDesktopPreviews, configs, configVersions, previews, user } from '@/db/schema'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { CONFIG_RANKING } from './config-items'
import {
  configDesktopPreview,
  configDesktopPreviewColumns,
  configDesktopPreviewJoin,
} from './desktop-preview'
import type { ConfigAuthor } from './queries'
import { galleryRanking } from './ranking'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How many status lines the home hero lets a visitor try. */
export const HERO_SIZE = 8

/**
 * The session the hero shows, as a scenario key (src/render/scenarios.ts): Everyday. Mods and
 * Desktop shots are recorded in it only, so the hero offers no other.
 */
export const HERO_SCENARIO_KEY = 'clean-main'

/** A status line the hero can show: what it names, and its render in the hero's session. */
export interface HeroLine {
  configId: string
  /** The live version this line's render and reach describe; the copy button installs only it. */
  versionId: string
  slug: string
  title: string
  copyCount: number
  author: ConfigAuthor | null
  /** What the script can reach, said under the hero's install button. */
  networkHosts: string[]
  readsClaudeToken: boolean
  /** Its render in the Everyday session; null while it has none. */
  render: AnsiSegment[] | null
  /** How it looks in Claude Desktop through statusline-anywhere; null without a shot. */
  desktop: DesktopShotImage | null
  /** Its Trending value, so the home page can rank it among mods as its gallery does. */
  sortKey: number | null
}

function shotOf(preview: ReturnType<typeof configDesktopPreview>): DesktopShotImage | null {
  return preview?.kind === 'shot' ? preview.shot : null
}

/**
 * The home hero's status lines: the first HERO_SIZE the home gallery ranks (Trending), each with
 * its Everyday render. The gallery's own query loads one render per card; this one is the hero's.
 */
export async function getHeroLines(db: Db): Promise<HeroLine[]> {
  const ranking = galleryRanking(CONFIG_RANKING, { sort: 'trending' })
  const rows = await db
    .select({
      configId: configs.id,
      versionId: configVersions.id,
      slug: configs.slug,
      copyCount: configs.copyCount,
      title: configVersions.title,
      sha: configVersions.contentSha256,
      networkHosts: configVersions.networkHosts,
      readsClaudeToken: configVersions.readsClaudeToken,
      author: { name: user.name, username: user.username, image: user.image },
      desktop: configDesktopPreviewColumns,
      sortKey: ranking.sortKey,
    })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .leftJoin(user, eq(user.id, configs.authorId))
    .leftJoin(configDesktopPreviews, configDesktopPreviewJoin)
    .where(ranking.where)
    .orderBy(...ranking.orderBy)
    .limit(HERO_SIZE)
  if (rows.length === 0) return []

  const rendered = await db
    .select({ sha: previews.scriptSha, segments: previews.segments })
    .from(previews)
    .where(
      and(
        inArray(
          previews.scriptSha,
          rows.map((row) => row.sha),
        ),
        eq(previews.scenarioKey, HERO_SCENARIO_KEY),
      ),
    )
  const renderBySha = new Map(
    rendered.map(({ sha, segments }) => [sha, compactSegments(segments as AnsiSegment[])]),
  )

  return rows.map(({ sha, author, networkHosts, readsClaudeToken, desktop, ...row }) => ({
    ...row,
    desktop: shotOf(configDesktopPreview(desktop)),
    networkHosts: networkHosts ?? [],
    readsClaudeToken: readsClaudeToken ?? false,
    author: author
      ? { name: author.name, username: author.username ?? null, image: author.image ?? null }
      : null,
    render: renderBySha.get(sha) ?? null,
  }))
}
