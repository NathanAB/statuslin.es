import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { getHeroLines, type HeroLine } from '@/gallery/hero-lines'
import { FEATURED_MOD_SLUG } from '@/mods/featured-mod'
import { getModSource, getPublishedModCard } from '@/mods/gallery-queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How many mods the home page's row asks for besides the featured one; those with no Desktop shot drop out. */
const MODS_ROW_CANDIDATES = 12

/** The parts of the home page that don't change with the gallery's sort, kind, tags or page: the
 * hero's status lines and the mods row. */
export interface HomeShowcase {
  hero: HeroLine[]
  /** The mods row: the featured mod (null while it isn't published), then the most trending. */
  mods: { featured: GalleryModCard | null; others: GalleryModCard[] }
}

export async function getHomeShowcase(db: Db): Promise<HomeShowcase> {
  const [hero, featured, others] = await Promise.all([
    getHeroLines(db),
    getPublishedModCard(db, FEATURED_MOD_SLUG),
    getModSource(db, {
      sort: 'trending',
      limit: MODS_ROW_CANDIDATES,
      excludeSlug: FEATURED_MOD_SLUG,
    }),
  ])
  return {
    hero,
    mods: {
      featured,
      others: others.items.flatMap(({ item }) => (item.kind === 'mod' ? [item.card] : [])),
    },
  }
}
