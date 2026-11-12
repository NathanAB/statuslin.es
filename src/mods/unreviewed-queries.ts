import { and, asc, eq, exists, not, type SQL, sql } from 'drizzle-orm'
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

/** A published mod whose live version matches `where`. */
async function publishedSlug(db: Db, where: SQL | undefined): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: mods.slug })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .where(and(eq(mods.status, 'published'), where))
  return row?.slug
}

/** A published mod's live version pins this row's repository and folder. */
function heldByListing(db: Db): SQL {
  return exists(
    db
      .select({ id: mods.id })
      .from(mods)
      .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
      .where(
        and(
          eq(mods.status, 'published'),
          eq(modVersions.repoUrl, unreviewedMods.repoUrl),
          eq(modVersions.path, unreviewedMods.path),
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
    const slug = await publishedSlug(
      db,
      and(
        eq(mods.pluginName, pluginName),
        sql`lower(split_part(${modVersions.repoUrl}, '/', 4)) = lower(${owner})`,
      ),
    )
    return slug ? { kind: 'reviewed', slug } : null
  }
  const slug = await publishedSlug(
    db,
    and(eq(modVersions.repoUrl, row.repoUrl), eq(modVersions.path, row.path)),
  )
  if (slug) return { kind: 'reviewed', slug }
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
    .where(not(heldByListing(db)))
    .orderBy(asc(unreviewedMods.pluginName), asc(sql`lower(${unreviewedMods.owner})`))
}
