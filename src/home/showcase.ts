import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { getHeroLines, HERO_SIZE, type HeroLine } from '@/gallery/hero-lines'
import { FEATURED_MOD_SLUG } from '@/mods/featured-mod'
import {
  getHeroMods,
  getModSource,
  getPublishedModCard,
  type HeroMod,
} from '@/mods/gallery-queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How many mods the home page's row asks for besides the featured one; those with no Desktop shot drop out. */
const MODS_ROW_CANDIDATES = 12

/** One thing the home hero lets a visitor try: a status line or a mod. */
export type HeroItem = { kind: 'status-line'; line: HeroLine } | { kind: 'mod'; mod: HeroMod }

/** The hero always lists at least this many of each kind, when there are that many. */
const HERO_MIN_PER_KIND = 3

/**
 * The hero's list: the first HERO_MIN_PER_KIND of each kind by Trending, then the rest of the
 * HERO_SIZE by Trending across both, shown largest first, as the home gallery ranks them. The
 * sort is stable, so ties keep status lines first.
 */
export function heroItems(lines: HeroLine[], mods: HeroMod[]): HeroItem[] {
  const key = (item: HeroItem) =>
    (item.kind === 'mod' ? item.mod.sortKey : item.line.sortKey) ?? Number.NEGATIVE_INFINITY
  const byTrending = (a: HeroItem, b: HeroItem) => key(b) - key(a)
  const lineItems = lines.map((line) => ({ kind: 'status-line' as const, line }))
  const modItems = mods.map((mod) => ({ kind: 'mod' as const, mod }))
  const kept = [...lineItems.slice(0, HERO_MIN_PER_KIND), ...modItems.slice(0, HERO_MIN_PER_KIND)]
  const rest = [...lineItems.slice(HERO_MIN_PER_KIND), ...modItems.slice(HERO_MIN_PER_KIND)].sort(
    byTrending,
  )
  return [...kept, ...rest].slice(0, HERO_SIZE).sort(byTrending)
}

/** The parts of the home page that don't change with the gallery's sort, kind, tags or page: the
 * hero's list and the mods row. */
export interface HomeShowcase {
  hero: HeroItem[]
  /** The mods row: the featured mod (null while it isn't published), then the most trending. */
  mods: { featured: GalleryModCard | null; others: GalleryModCard[] }
}

export async function getHomeShowcase(db: Db): Promise<HomeShowcase> {
  const [lines, heroMods, featured, others] = await Promise.all([
    getHeroLines(db),
    getHeroMods(db),
    getPublishedModCard(db, FEATURED_MOD_SLUG),
    getModSource(db, {
      sort: 'trending',
      limit: MODS_ROW_CANDIDATES,
      excludeSlug: FEATURED_MOD_SLUG,
    }),
  ])
  return {
    hero: heroItems(lines, heroMods),
    mods: {
      featured,
      others: others.items.flatMap(({ item }) => (item.kind === 'mod' ? [item.card] : [])),
    },
  }
}
