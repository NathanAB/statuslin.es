import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modVersions } from '@/db/schema'
import { isUniqueViolation } from '@/db/unique-violation'
import { HttpError } from '@/lib/http'
import { assertUnderRateLimit, insertPendingSubmission } from '@/submissions/record'
import type { GitHub } from './github'
import {
  type InspectDeps,
  insertDraftMod,
  insertNextVersion,
  inspectSource,
  type NewVersion,
  type PinnedSource,
} from './import'
import { type LinkGitHub, parseModLink, resolveModLink } from './link'
import { folderHolder } from './listing'
import { addOwnVersion, findOwnMod, NO_NEW_VERSION, newVersionKind, type OwnMod } from './own-mod'
import { PluginRefusal } from './plugin-facts'
import type { SubmitGuard } from './submit-guard'
import { MOD_TITLE_MAX } from './submit-input'
import { CONTROL_OR_FORMAT } from './terminal-line'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

type SubmitGitHub = LinkGitHub & Pick<GitHub, 'compareCommits'>

export type ModSubmitDeps = InspectDeps & {
  github: SubmitGitHub & InspectDeps['github']
  guard: SubmitGuard
}

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
/** A refusal quotes the validator; past this it is cut short. */
const REFUSAL_MAX_CHARS = 1000

/**
 * What is wrong with the plugin, said to the submitter. Our own failures (the sandbox, the
 * network) stay errors, so they reach the error tracker as 500s instead of reading as refusals.
 */
function refuseInspection(error: unknown): never {
  if (error instanceof PluginRefusal) {
    const message =
      error.message.length > REFUSAL_MAX_CHARS
        ? `${error.message.slice(0, REFUSAL_MAX_CHARS)}…`
        : error.message
    throw new HttpError(400, `The plugin didn't pass its check: ${message}`)
  }
  if (error instanceof Error && TOO_LARGE.test(error.message)) {
    throw new HttpError(
      400,
      'The repository is over 2,000 files or 20 MB: put the mod in its own repository.',
    )
  }
  throw error
}

/** A submitted draft's slug until approval gives it its marketplace name (ADR 0005). */
function provisionalSlug(pluginName: string): string {
  return `${pluginName}-${randomBytes(3).toString('hex')}`
}

function checkedTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length > MOD_TITLE_MAX) {
    throw new HttpError(400, `The title must be at most ${MOD_TITLE_MAX} characters.`)
  }
  if (CONTROL_OR_FORMAT.test(trimmed)) {
    throw new HttpError(400, 'The title must not contain control or format characters.')
  }
  return trimmed
}

async function refuseUnlessAheadOfLive(
  db: Db,
  own: OwnMod,
  source: { repoUrl: string; commitSha: string },
  github: SubmitGitHub,
) {
  if (own.status !== 'published') return
  const [live] = await db
    .select({ commitSha: modVersions.commitSha })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .where(eq(mods.id, own.id))
  if (!live) return
  const comparison = await github.compareCommits(source.repoUrl, live.commitSha, source.commitSha)
  if (comparison === 'ahead') return
  const commit = source.commitSha.slice(0, 7)
  const liveCommit = live.commitSha.slice(0, 7)
  throw new HttpError(
    409,
    comparison === 'diverged'
      ? `Commit ${commit} doesn't build on the live commit ${liveCommit}. Link to a commit that includes it.`
      : `Commit ${commit} is behind the live commit ${liveCommit}. Link to a newer commit.`,
  )
}

/** Pins the link, and refuses what can't become this submission before anything is downloaded. */
async function pinSource(db: Db, input: ModSubmitInput, own: OwnMod | null, github: SubmitGitHub) {
  const link = await resolveModLink(parseModLink(input.link), github)
  const source = { repoUrl: link.repoUrl, path: link.path, commitSha: link.commitSha }
  if (own) {
    if (link.repoUrl !== own.repoUrl || link.path !== own.path) {
      const folder = own.path === '' ? 'its root' : own.path
      throw new HttpError(400, `Link to a newer commit of ${own.repoUrl}, at ${folder}.`)
    }
    const [same] = await db
      .select({ id: modVersions.id })
      .from(modVersions)
      .where(and(eq(modVersions.modId, own.id), eq(modVersions.commitSha, source.commitSha)))
    if (same) throw new HttpError(409, 'That commit is already submitted.')
    await refuseUnlessAheadOfLive(db, own, source, github)
    return { link, source }
  }
  const holder = await folderHolder(db, source, { userId: input.submittedBy })
  if (holder) {
    throw new HttpError(
      409,
      holder.status === 'draft' && holder.submittedBy === input.submittedBy
        ? 'That plugin is already submitted. To change your own submission, open it from My submissions.'
        : `That plugin is already listed as "${holder.slug}".`,
    )
  }
  return { link, source }
}

/** Reads the plugin in the sandbox; an update must keep the published plugin's name. */
async function inspectFor(own: OwnMod | null, source: PinnedSource, deps: InspectDeps) {
  const facts = await inspectSource(source, deps).catch(refuseInspection)
  if (own?.status === 'published' && facts.manifest.name !== own.pluginName) {
    throw new HttpError(
      400,
      `plugin.json names the plugin "${facts.manifest.name}", not "${own.pluginName}".`,
    )
  }
  return facts
}

/** A draft mod credited to the repository owner, with its first version and pending submission. */
async function addNewMod(
  db: Db,
  version: Omit<NewVersion, 'modId'>,
  { title, owner, submittedBy }: { title: string | undefined; owner: string; submittedBy: string },
): Promise<{ modId: string; slug: string }> {
  const modId = randomUUID()
  const { facts, versionId } = version
  const slug = provisionalSlug(facts.manifest.name)
  await db.transaction(async (tx) => {
    await insertDraftMod(tx, {
      modId,
      slug,
      title: title || facts.manifest.name,
      owner,
      facts,
      versionId,
    })
    await insertNextVersion(tx, { ...version, modId })
    await insertPendingSubmission(tx, { kind: 'mod', versionId, submittedBy })
  })
  return { modId, slug }
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
  const { submittedBy } = input
  await assertUnderRateLimit(db, submittedBy)
  const title = input.title === undefined ? undefined : checkedTitle(input.title)
  const own = input.slug ? await findOwnMod(db, input.slug, submittedBy) : null
  if (own && !(await newVersionKind(db, own))) throw new HttpError(409, NO_NEW_VERSION)
  // The submission rate limit counts stored submissions; the guard bounds the work before that.
  return deps.guard.run(submittedBy, async () => {
    const { link, source } = await pinSource(db, input, own, deps.github)
    const facts = await inspectFor(own, source, deps)
    const versionId = randomUUID()
    const version = { versionId, source, facts, license: link.license, inputSteps: [] }
    const pinned = { versionId, commitSha: link.commitSha, ref: link.ref }
    try {
      if (own) {
        const newVersion = { ...version, modId: own.id }
        const isUpdate = await addOwnVersion(db, own, newVersion, submittedBy, title || undefined)
        return { ...pinned, modId: own.id, slug: own.slug, isUpdate }
      }
      const added = await addNewMod(db, version, { title, owner: link.owner, submittedBy })
      return { ...pinned, ...added, isUpdate: false }
    } catch (error) {
      // Two submissions of the same commit, or of two plugins taking one name, raced each other.
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'That mod was just submitted; try again.')
      }
      throw error
    }
  })
}
