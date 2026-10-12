import { asc, desc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modVersions, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A mod the user submitted: its first submission is theirs. Curated mods have none. */
export interface OwnMod {
  id: string
  slug: string
  status: string
  pluginName: string
  repoUrl: string
  path: string
}

export async function findOwnMod(db: Db, slug: string, userId: string): Promise<OwnMod> {
  const [first] = await db
    .select({
      id: mods.id,
      slug: mods.slug,
      status: mods.status,
      pluginName: mods.pluginName,
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      submittedBy: submissions.submittedBy,
    })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.modId, mods.id))
    .innerJoin(submissions, eq(submissions.modVersionId, modVersions.id))
    .where(eq(mods.slug, slug))
    .orderBy(asc(modVersions.versionNumber))
    .limit(1)
  if (!first || first.submittedBy !== userId) throw new HttpError(404, 'mod not found')
  const { submittedBy: _submittedBy, ...mod } = first
  return mod
}

/** What /submit?kind=mod prefills for a new version of the submitter's own mod. */
export interface ModDraft {
  kind: 'update' | 'resubmission'
  slug: string
  title: string
  /** The plugin's folder at the default branch's newest commit. */
  link: string
}

export async function getOwnModDraft(
  db: Db,
  slug: string,
  kind: ModDraft['kind'],
  userId: string,
): Promise<ModDraft> {
  const own = await findOwnMod(db, slug, userId)
  const [latest] = await db
    .select({ title: mods.title, status: submissions.status })
    .from(modVersions)
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .innerJoin(submissions, eq(submissions.modVersionId, modVersions.id))
    .where(eq(modVersions.modId, own.id))
    .orderBy(desc(modVersions.versionNumber))
    .limit(1)
  const fits =
    kind === 'update'
      ? own.status === 'published'
      : own.status === 'draft' && latest?.status === 'rejected'
  if (!latest || !fits) {
    throw new HttpError(
      409,
      kind === 'update'
        ? 'only a published mod can be updated'
        : 'only a rejected submission can be resubmitted',
    )
  }
  const link = own.path === '' ? own.repoUrl : `${own.repoUrl}/tree/HEAD/${own.path}`
  return { kind, slug: own.slug, title: latest.title, link }
}
