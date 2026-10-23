import type { PgDatabase } from 'drizzle-orm/pg-core'
import { getHeroLines, HERO_SIZE, type HeroLine } from '@/gallery/hero-lines'
import { getHeroMods, type HeroMod } from '@/mods/gallery-queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

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

/** The part of the home page that doesn't change with the gallery's sort, kind, tags or page:
 * the hero's list. */
export interface HomeShowcase {
  hero: HeroItem[]
}

export async function getHomeShowcase(db: Db): Promise<HomeShowcase> {
  const [lines, heroMods] = await Promise.all([getHeroLines(db), getHeroMods(db)])
  return { hero: heroItems(lines, heroMods) }
}

/**
 * The hero opens the page; the gallery under it is the content. If the hero's lists fail to load,
 * the failure is reported and the home page renders without them instead of as an error page.
 */
export async function showcaseOrEmpty(
  load: () => Promise<HomeShowcase>,
  report: (error: unknown) => void,
): Promise<HomeShowcase> {
  try {
    return await load()
  } catch (error) {
    report(error)
    return { hero: [] }
  }
}
