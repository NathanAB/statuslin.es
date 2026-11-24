import { and, eq, exists, isNotNull, not, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import { alias, type PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, mods, modVersions, submissions, unreviewedMods } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * What an unreviewed mod's page shows: from its `unreviewed_mods` row, or from a curated draft the
 * operator showed (ADR 0014). Every text field but the pins is the author's, untrusted.
 */
export interface UnreviewedMod {
  owner: string
  pluginName: string
  description: string
  repoUrl: string
  path: string
  commitSha: string
  /** ISO timestamps. null for a curated draft, which stores no commit date. */
  committedAt: string | null
  license: string | null
  /** null for a curated draft, which stores no star count. */
  stars: number | null
  footprint: ModFootprint
  validatedWith: string
  checkedAt: string
}

/** The page, or the listing it became once the mod was reviewed (ADR 0011). */
export type UnreviewedLookup =
  | { kind: 'page'; mod: UnreviewedMod }
  | { kind: 'reviewed'; slug: string }

/** The owner of a version's repository, as its URL spells it: the owner in an unreviewed address. */
export const versionOwner = sql<string>`split_part(${modVersions.repoUrl}, '/', 4)`

// Aliased, so a takeover query nested in a query of `mods` doesn't shadow the outer mod.
const takenMod = alias(mods, 'taken_mod')
const takenVersion = alias(modVersions, 'taken_version')

/** A published mod whose live version pins the folder, or a delisted mod that ever pinned it. */
const takesFolder = or(
  eq(takenMod.status, 'removed'),
  and(eq(takenMod.status, 'published'), eq(takenVersion.id, takenMod.currentVersionId)),
)

/** The mods that have taken a folder over from its unreviewed page: a published listing whose live
 * version pins it, which the page redirects to, or a delisted mod that ever pinned it, which hides
 * the page. */
function takeovers(db: Db, folder: { repoUrl: string | SQLWrapper; path: string | SQLWrapper }) {
  return db
    .select({ slug: takenMod.slug, status: takenMod.status })
    .from(takenMod)
    .innerJoin(takenVersion, eq(takenVersion.modId, takenMod.id))
    .where(
      and(
        eq(takenVersion.repoUrl, folder.repoUrl),
        eq(takenVersion.path, folder.path),
        takesFolder,
      ),
    )
}

const shownVersion = alias(modVersions, 'shown_version')

/**
 * The one test for a curated draft with an unreviewed page (ADR 0014), as a condition on `mods`:
 * a draft the operator showed, whose live version's folder no published listing holds, no delisted
 * mod ever pinned, and no submission of was rejected. Everything that shows such a draft (its
 * page, its theme cards, /mods, the sitemap, the preview images) reads this.
 */
export function hasUnreviewedPage(db: Db): SQL {
  const closed = db
    .select({ id: takenVersion.id })
    .from(shownVersion)
    .innerJoin(
      takenVersion,
      and(eq(takenVersion.repoUrl, shownVersion.repoUrl), eq(takenVersion.path, shownVersion.path)),
    )
    .innerJoin(takenMod, eq(takenMod.id, takenVersion.modId))
    .leftJoin(submissions, eq(submissions.modVersionId, takenVersion.id))
    .where(
      and(
        eq(shownVersion.id, mods.currentVersionId),
        or(takesFolder, eq(submissions.status, 'rejected')),
      ),
    )
  return sql`(${eq(mods.status, 'draft')} and ${isNotNull(mods.unreviewedPageAt)} and not ${exists(closed)})`
}

/** A shown draft's page, from the draft and its live version. */
async function findShownDraft(
  db: Db,
  { owner, pluginName }: { owner: string; pluginName: string },
): Promise<UnreviewedMod | null> {
  const [draft] = await db
    .select({
      owner: versionOwner,
      pluginName: mods.pluginName,
      description: mods.description,
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      commitSha: modVersions.commitSha,
      license: modVersions.license,
      footprint: modVersions.footprint,
      validatedWith: modVersions.validatedWith,
      checkedAt: modVersions.createdAt,
    })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .where(
      and(
        hasUnreviewedPage(db),
        eq(mods.pluginName, pluginName),
        sql`lower(${versionOwner}) = lower(${owner})`,
      ),
    )
  if (!draft) return null
  return { ...draft, committedAt: null, stars: null, checkedAt: draft.checkedAt.toISOString() }
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
          sql`lower(${versionOwner}) = lower(${owner})`,
        ),
      )
    if (listing) return { kind: 'reviewed', slug: listing.slug }
    const draft = await findShownDraft(db, { owner, pluginName })
    return draft ? { kind: 'page', mod: draft } : null
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

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** By plugin name, then owner whatever its case. */
const byAddress = (a: UnreviewedModLink, b: UnreviewedModLink) =>
  compare(a.pluginName, b.pluginName) || compare(a.owner.toLowerCase(), b.owner.toLowerCase())

/**
 * Every unreviewed mod with a page, by name: a plain list, never a ranking. With the curated drafts
 * shown as unreviewed mods (ADR 0014).
 */
export async function listUnreviewedMods(db: Db): Promise<UnreviewedModLink[]> {
  const [rows, drafts] = await Promise.all([
    db
      .select({
        owner: unreviewedMods.owner,
        pluginName: unreviewedMods.pluginName,
        description: unreviewedMods.description,
        checkedAt: unreviewedMods.checkedAt,
      })
      .from(unreviewedMods)
      .where(not(exists(takeovers(db, unreviewedMods)))),
    db
      .select({
        owner: versionOwner,
        pluginName: mods.pluginName,
        description: mods.description,
        checkedAt: modVersions.createdAt,
      })
      .from(mods)
      .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
      .where(hasUnreviewedPage(db)),
  ])
  return [...rows, ...drafts].sort(byAddress)
}
