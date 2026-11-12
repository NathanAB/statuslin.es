import { and, asc, eq, exists, not, or, type SQLWrapper, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, mods, modVersions, unreviewedMods } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** What an unreviewed mod's page shows. Every text field but the pins is the author's, untrusted. */
export interface UnreviewedMod {
  owner: string
  pluginName: string
  description: string
  repoUrl: string
  path: string
  commitSha: string
  /** ISO timestamps. */
  committedAt: string
  license: string | null
  stars: number
  footprint: ModFootprint
  validatedWith: string
  checkedAt: string
}

/** The page, or the listing it became once the mod was reviewed (ADR 0011). */
export type UnreviewedLookup =
  | { kind: 'page'; mod: UnreviewedMod }
  | { kind: 'reviewed'; slug: string }

/** The mods that have taken a folder over from its unreviewed page: a published listing whose live
 * version pins it, which the page redirects to, or a delisted mod that ever pinned it, which hides
 * the page. */
function takeovers(db: Db, folder: { repoUrl: string | SQLWrapper; path: string | SQLWrapper }) {
  return db
    .select({ slug: mods.slug, status: mods.status })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.modId, mods.id))
    .where(
      and(
        eq(modVersions.repoUrl, folder.repoUrl),
        eq(modVersions.path, folder.path),
        or(
          eq(mods.status, 'removed'),
          and(eq(mods.status, 'published'), eq(modVersions.id, mods.currentVersionId)),
        ),
      ),
    )
}

export async function findUnreviewedMod(
  db: Db,
  { owner, pluginName }: { owner: string; pluginName: string },
): Promise<UnreviewedLookup | null> {
  const [row] = await db
    .select()
    .from(unreviewedMods)
    .where(
      and(
        sql`lower(${unreviewedMods.owner}) = lower(${owner})`,
        eq(unreviewedMods.pluginName, pluginName),
      ),
    )
  if (!row) {
    // The entry left the file once its listing was published: the address still leads there.
    const [listing] = await db
      .select({ slug: mods.slug })
      .from(mods)
      .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
      .where(
        and(
          eq(mods.status, 'published'),
          eq(mods.pluginName, pluginName),
          sql`lower(split_part(${modVersions.repoUrl}, '/', 4)) = lower(${owner})`,
        ),
      )
    return listing ? { kind: 'reviewed', slug: listing.slug } : null
  }
  const taken = await takeovers(db, row)
  const listing = taken.find((mod) => mod.status === 'published')
  if (listing) return { kind: 'reviewed', slug: listing.slug }
  if (taken.length > 0) return null
  return {
    kind: 'page',
    mod: {
      owner: row.owner,
      pluginName: row.pluginName,
      description: row.description,
      repoUrl: row.repoUrl,
      path: row.path,
      commitSha: row.commitSha,
      committedAt: row.committedAt.toISOString(),
      license: row.license,
      stars: row.stars,
      footprint: row.footprint,
      validatedWith: row.validatedWith,
      checkedAt: row.checkedAt.toISOString(),
    },
  }
}

export interface UnreviewedModLink {
  owner: string
  pluginName: string
  description: string
  checkedAt: Date
}

/** Every unreviewed mod with a page, by name: a plain list, never a ranking. */
export function listUnreviewedMods(db: Db): Promise<UnreviewedModLink[]> {
  return db
    .select({
      owner: unreviewedMods.owner,
      pluginName: unreviewedMods.pluginName,
      description: unreviewedMods.description,
      checkedAt: unreviewedMods.checkedAt,
    })
    .from(unreviewedMods)
    .where(not(exists(takeovers(db, unreviewedMods))))
    .orderBy(asc(unreviewedMods.pluginName), asc(sql`lower(${unreviewedMods.owner})`))
}
