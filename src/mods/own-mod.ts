import { asc, desc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modVersions, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'
import {
  insertPendingSubmission,
  supersedePending,
  supersedeRejectionEmail,
} from '@/submissions/record'
import { insertNextVersion } from './import'

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

/** The new version an own mod takes: an update once published, a fix after a rejected one. */
export async function newVersionKind(db: Db, own: OwnMod): Promise<ModDraft['kind'] | null> {
  if (own.status === 'published') return 'update'
  if (own.status !== 'draft') return null
  const [latest] = await db
    .select({ status: submissions.status })
    .from(modVersions)
    .innerJoin(submissions, eq(submissions.modVersionId, modVersions.id))
    .where(eq(modVersions.modId, own.id))
    .orderBy(desc(modVersions.versionNumber))
    .limit(1)
  return latest?.status === 'rejected' ? 'resubmission' : null
}

export async function getOwnModDraft(
  db: Db,
  slug: string,
  kind: ModDraft['kind'],
  userId: string,
): Promise<ModDraft> {
  const own = await findOwnMod(db, slug, userId)
  if ((await newVersionKind(db, own)) !== kind) {
    throw new HttpError(
      409,
      kind === 'update'
        ? 'only a published mod can be updated'
        : 'only a rejected submission can be resubmitted',
    )
  }
  const [mod] = await db.select({ title: mods.title }).from(mods).where(eq(mods.id, own.id))
  const link = own.path === '' ? own.repoUrl : `${own.repoUrl}/tree/HEAD/${own.path}`
  return { kind, slug: own.slug, title: mod?.title ?? own.slug, link }
}

export const NO_NEW_VERSION =
  'only a published mod, or one whose last version was rejected, takes a new version'

/**
 * A new version of the submitter's own mod, in one transaction. A published mod gets an update,
 * reviewed again while the live version keeps serving; a newer pending update replaces an older one
 * (ADR 0001). A draft whose last version was rejected gets the fix, which may take a new title
 * and rename the plugin.
 */
export async function addOwnVersion(
  db: Db,
  own: OwnMod,
  version: Parameters<typeof insertNextVersion>[1],
  submittedBy: string,
  title: string | undefined,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // The mod first, the order approval takes its locks in.
    const [mod] = await tx
      .select({ status: mods.status })
      .from(mods)
      .where(eq(mods.id, own.id))
      .for('update')
    const [latest] = await tx
      .select({ submission: submissions })
      .from(modVersions)
      .innerJoin(submissions, eq(submissions.modVersionId, modVersions.id))
      .where(eq(modVersions.modId, own.id))
      .orderBy(desc(modVersions.versionNumber))
      .limit(1)
    const isUpdate = mod?.status === 'published'
    if (!isUpdate && (mod?.status !== 'draft' || latest?.submission.status !== 'rejected')) {
      throw new HttpError(409, NO_NEW_VERSION)
    }
    if (latest?.submission.status === 'rejected') {
      await supersedeRejectionEmail(tx, latest.submission)
    }
    const earlier = await tx
      .select({ id: modVersions.id })
      .from(modVersions)
      .where(eq(modVersions.modId, own.id))
    await supersedePending(
      tx,
      earlier.map((row) => row.id),
    )
    await insertNextVersion(tx, version)
    await insertPendingSubmission(tx, { kind: 'mod', versionId: version.versionId, submittedBy })
    if (!isUpdate) {
      // A fix may rename the plugin; its marketplace name is picked when it is approved.
      await tx
        .update(mods)
        .set({ pluginName: version.facts.manifest.name, ...(title ? { title } : {}) })
        .where(eq(mods.id, own.id))
    }
    return isUpdate
  })
}
