import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { GalleryItem } from '@/gallery/gallery-items'
import { getConfigsSharingTags } from '@/gallery/queries'
import { getModsSharingTags } from './gallery-queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How many mods, and how many status lines, a mod page links to under "More like this". */
export const MOD_RELATED_LIMIT = 4

/**
 * What a mod page links to under "More like this": other published mods, then published status
 * lines, that share a tag with it, most shared tags first. Up to MOD_RELATED_LIMIT of each.
 */
export async function getModRelated(
  db: Db,
  mod: { slug: string; tags: string[] },
): Promise<GalleryItem[]> {
  const [mods, statusLines] = await Promise.all([
    getModsSharingTags(db, mod, MOD_RELATED_LIMIT),
    getConfigsSharingTags(db, mod.tags, MOD_RELATED_LIMIT),
  ])
  return [...mods, ...statusLines.map((card) => ({ kind: 'status-line' as const, card }))]
}
