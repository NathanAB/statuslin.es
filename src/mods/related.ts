import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { GalleryItem } from '@/gallery/gallery-items'
import { bySharedTags, getConfigsSharingTags } from '@/gallery/queries'
import { getModSource } from './gallery-queries'

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
  if (mod.tags.length === 0) return []
  const [mods, statusLines] = await Promise.all([
    getModSource(db, { sort: 'top' }),
    getConfigsSharingTags(db, mod.tags, MOD_RELATED_LIMIT),
  ])
  const otherMods = mods.items.flatMap(({ item }) =>
    item.kind === 'mod' && item.card.slug !== mod.slug ? [item] : [],
  )
  return [
    ...bySharedTags(otherMods, mod.tags, (item) => item.card.tags).slice(0, MOD_RELATED_LIMIT),
    ...statusLines.map((card) => ({ kind: 'status-line' as const, card })),
  ]
}
