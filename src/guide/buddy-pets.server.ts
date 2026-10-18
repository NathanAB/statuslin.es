import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modVersions } from '@/db/schema'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { getPublishedModCard } from '@/mods/gallery-queries'
import { type SharedCommand, sharedCommands } from './buddy-pets'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface BuddyPets {
  /** The published mods among the slugs, in that order, as the gallery's cards. */
  cards: GalleryModCard[]
  /** The slash commands two or more of them add. */
  clashes: SharedCommand[]
}

/** What /guide/claude-code-buddy shows. A draft, removed or unknown slug is left out. */
export async function buddyPets(db: Db, slugs: readonly string[]): Promise<BuddyPets> {
  const [found, footprints] = await Promise.all([
    Promise.all(slugs.map((slug) => getPublishedModCard(db, slug))),
    db
      .select({ slug: mods.slug, footprint: modVersions.footprint })
      .from(mods)
      .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
      .where(and(eq(mods.status, 'published'), inArray(mods.slug, [...slugs]))),
  ])
  const cards = found.filter((card) => card !== null)
  const footprintOf = new Map(footprints.map((row) => [row.slug, row.footprint]))
  const pets = cards.flatMap((card) => {
    const footprint = footprintOf.get(card.slug)
    return footprint ? [{ title: card.title, footprint }] : []
  })
  return { cards, clashes: sharedCommands(pets) }
}
