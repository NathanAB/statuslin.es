import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modVersions, submissions } from '@/db/schema'
import { isUniqueViolation } from '@/db/unique-violation'
import { HttpError } from '@/lib/http'
import {
  assertUnderRateLimit,
  insertPendingSubmission,
  supersedePending,
  supersedeRejectionEmail,
} from '@/submissions/record'
import {
  type InspectDeps,
  importedSlug,
  insertDraftMod,
  insertNextVersion,
  inspectSource,
  pickSlug,
} from './import'
import { type LinkGitHub, parseModLink, resolveModLink } from './link'
import { findOwnMod, type OwnMod } from './own-mod'
import { CONTROL_OR_FORMAT } from './terminal-line'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const MOD_TITLE_MAX = 200

export type ModSubmitDeps = InspectDeps & { github: LinkGitHub & InspectDeps['github'] }

export interface ModSubmitInput {
  submittedBy: string
  link: string
  /** Defaults to the plugin's name. Ignored for an update, which keeps the live title. */
  title?: string
  /** A mod of the submitter's own: an update when it is published, a fix when its last version was rejected. */
  slug?: string
}

export interface ModSubmitResult {
  modId: string
  versionId: string
  slug: string
  commitSha: string
  /** The branch, tag or commit the link named. */
  ref: string
  isUpdate: boolean
}

const TOO_LARGE = /has more than \d+ files|is larger than \d+ bytes/

/** What reading the plugin failed on, said to the submitter; GitHub's rate limit passes through. */
function refuseInspection(error: unknown): never {
  if (error instanceof HttpError) throw error
  const message = error instanceof Error ? error.message : String(error)
  if (TOO_LARGE.test(message)) {
    throw new HttpError(
      400,
      'The repository is over 2,000 files or 20 MB: put the mod in its own repository.',
    )
  }
  throw new HttpError(400, `Checking the plugin failed: ${message}`)
}

function checkedTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length > MOD_TITLE_MAX) {
    throw new HttpError(400, `The title must be at most ${MOD_TITLE_MAX} characters.`)
  }
  if (CONTROL_OR_FORMAT.test(trimmed)) {
    throw new HttpError(400, 'The title must not hold control or format characters.')
  }
  return trimmed
}

/**
 * A new version of the submitter's own mod, in one transaction. A published mod gets an update,
 * reviewed again while the live version keeps serving; a newer pending update replaces an older one
 * (ADR 0001). A draft whose last version was rejected gets the fix, and may take a new title.
 */
async function addOwnVersion(
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
      throw new HttpError(
        409,
        'only a published mod, or one whose last version was rejected, takes a new version',
      )
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
    if (!isUpdate && title) await tx.update(mods).set({ title }).where(eq(mods.id, own.id))
    return isUpdate
  })
}

/**
 * Submits a mod by GitHub link (ADR 0005): pins the link to a commit on the default branch, reads
 * the plugin in an offline sandbox, and writes a draft mod (or a new version of the submitter's
 * own mod) with its pending submission. Rendering and review follow on the operator's side.
 */
export async function submitMod(
  db: Db,
  input: ModSubmitInput,
  deps: ModSubmitDeps,
): Promise<ModSubmitResult> {
  await assertUnderRateLimit(db, input.submittedBy)
  const title = input.title === undefined ? undefined : checkedTitle(input.title)
  const own = input.slug ? await findOwnMod(db, input.slug, input.submittedBy) : null
  const link = await resolveModLink(parseModLink(input.link), deps.github)
  if (own && (link.repoUrl !== own.repoUrl || link.path !== own.path)) {
    const folder = own.path === '' ? 'its root' : own.path
    throw new HttpError(400, `Link to a newer commit of ${own.repoUrl}, at ${folder}.`)
  }
  const source = { repoUrl: link.repoUrl, path: link.path, commitSha: link.commitSha }
  const taken = await importedSlug(db, source)
  if (taken) throw new HttpError(409, `That commit is already submitted, as "${taken}".`)
  const facts = await inspectSource(source, deps).catch(refuseInspection)
  if (own && facts.manifest.name !== own.pluginName) {
    throw new HttpError(
      400,
      `plugin.json names the plugin "${facts.manifest.name}", not "${own.pluginName}".`,
    )
  }
  const versionId = randomUUID()
  const version = { versionId, source, facts, license: link.license, inputSteps: [] }
  try {
    if (own) {
      const isUpdate = await addOwnVersion(
        db,
        own,
        { ...version, modId: own.id },
        input.submittedBy,
        title || undefined,
      )
      return {
        modId: own.id,
        versionId,
        slug: own.slug,
        commitSha: link.commitSha,
        ref: link.ref,
        isUpdate,
      }
    }
    const modId = randomUUID()
    const slug = await pickSlug(db, facts.manifest.name, link.owner)
    await db.transaction(async (tx) => {
      await insertDraftMod(tx, {
        modId,
        slug,
        title: title || facts.manifest.name,
        owner: link.owner,
        facts,
        versionId,
      })
      await insertNextVersion(tx, { ...version, modId })
      await insertPendingSubmission(tx, { kind: 'mod', versionId, submittedBy: input.submittedBy })
    })
    return { modId, versionId, slug, commitSha: link.commitSha, ref: link.ref, isUpdate: false }
  } catch (error) {
    // Two submissions of the same commit, or of two plugins taking one name, raced each other.
    if (isUniqueViolation(error))
      throw new HttpError(409, 'That mod was just submitted; try again.')
    throw error
  }
}
