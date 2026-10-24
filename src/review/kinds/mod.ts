import { and, desc, eq, lt } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModStatus, mods, modVersions, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { modPath } from '@/lib/site'
import type { CommitComparison, GitHub, GitHubSource } from '@/mods/github'
import { marketplaceName } from '@/mods/listing'
import {
  alreadyCurrentGuard,
  compareBase,
  currentChangedGuard,
  loadCurrentVersion,
  loadVersions,
  type PublishVersion,
  publishedRow,
  publishGuards,
  removedGuard,
} from '@/mods/publish'
import type { ReviewedChange } from '../review-email'
import type { ApprovalContext, Publish, RejectionContext, ReviewKind } from './kind'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** What approving a mod asks GitHub. */
export type ModReviewGitHub = Pick<GitHub, 'commitIsOnDefaultBranch' | 'compareCommits'> &
  Pick<GitHubSource, 'pluginDescription'>

const NOUN = 'mod'
const NOT_PENDING = 'version not in a reviewable (pending) state'

async function versionMod(database: Db, versionId: string) {
  const [row] = await database
    .select({
      id: mods.id,
      slug: mods.slug,
      pluginName: mods.pluginName,
      authorGithub: mods.authorGithub,
      title: mods.title,
      status: mods.status,
      currentVersionId: mods.currentVersionId,
      versionNumber: modVersions.versionNumber,
    })
    .from(modVersions)
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .where(eq(modVersions.id, versionId))
  return row
}

interface ReadMod {
  id: string
  slug: string
  pluginName: string
  authorGithub: string
  status: ModStatus
  currentVersionId: string | null
}

/**
 * Moves the mod's live pointer to the version, publishing a draft under its marketplace name, and
 * derives its tags from the version's footprint, as approving a status line does. Only while the
 * mod's status and pointer are what the approval checked against; otherwise a 409 says what
 * changed. Writes only through `tx`.
 */
function publishStep(target: PublishVersion, description: string, read: ReadMod): Publish {
  return async (tx) => {
    const [mod] = await tx
      .select({ status: mods.status, currentVersionId: mods.currentVersionId, tags: mods.tags })
      .from(mods)
      .where(eq(mods.id, read.id))
      .for('update')
    if (mod?.status !== read.status || mod.currentVersionId !== read.currentVersionId) {
      const guard =
        mod?.status === 'removed' ? removedGuard(read.slug) : currentChangedGuard(read.slug)
      throw new HttpError(409, guard.message)
    }
    const slug = read.status === 'draft' ? await marketplaceName(tx, read, target) : read.slug
    await tx
      .update(mods)
      .set({ slug, ...publishedRow(target, mod.tags, description) })
      .where(eq(mods.id, read.id))
  }
}

async function compareToLive(
  github: ModReviewGitHub,
  current: PublishVersion | null,
  target: PublishVersion,
): Promise<CommitComparison | null> {
  const base = compareBase(current, target)
  return base ? github.compareCommits(target.repoUrl, base.commitSha, target.commitSha) : null
}

/** The live version's number, to refuse rolling the mod back to an older one. */
async function liveVersionNumber(database: Db, liveId: string): Promise<number | undefined> {
  const [live] = await database
    .select({ versionNumber: modVersions.versionNumber })
    .from(modVersions)
    .where(eq(modVersions.id, liveId))
  return live?.versionNumber
}

/** An approval is an update when an earlier version of the mod was approved, so went live. */
async function approvedChange(
  database: Db,
  modId: string,
  versionNumber: number,
): Promise<ReviewedChange> {
  const [earlier] = await database
    .select({ id: modVersions.id })
    .from(modVersions)
    .innerJoin(submissions, eq(submissions.modVersionId, modVersions.id))
    .where(
      and(
        eq(modVersions.modId, modId),
        eq(submissions.status, 'approved'),
        lt(modVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1)
  return earlier ? 'update' : 'submission'
}

export function modReview(github: ModReviewGitHub): ReviewKind {
  return {
    async prepareApproval(database, versionId) {
      const mod = await versionMod(database, versionId)
      const [target] = await loadVersions(database, eq(modVersions.id, versionId))
      if (!mod || !target) throw new HttpError(409, NOT_PENDING)
      // A draft already points at its first version; only a published mod has one live.
      const current = mod.status === 'published' ? await loadCurrentVersion(database, mod) : null
      if (current?.id === target.id) {
        throw new HttpError(409, alreadyCurrentGuard(mod.slug, target.commitSha).message)
      }
      const live = current ? await liveVersionNumber(database, current.id) : undefined
      if (live !== undefined && live > mod.versionNumber) {
        throw new HttpError(
          409,
          `"${mod.slug}" v${mod.versionNumber} is older than the live v${live}; approve a newer version`,
        )
      }
      const description = await github.pluginDescription(
        target.repoUrl,
        target.path,
        target.commitSha,
      )
      const guards = publishGuards({
        slug: mod.slug,
        modStatus: mod.status,
        description,
        target,
        current,
        onDefaultBranch: await github.commitIsOnDefaultBranch(target.repoUrl, target.commitSha),
        // The file list feeds only a warning, which the /admin card shows with a compare link.
        filesChanged: null,
        comparedToLive: await compareToLive(github, current, target),
      })
      const refusals = guards.filter((guard) => guard.level === 'refuse')
      if (refusals.length > 0 || description === null) {
        throw new HttpError(409, refusals.map((guard) => guard.message).join('; '))
      }
      return publishStep(target, description, mod)
    },

    async approvalContext(database, versionId): Promise<ApprovalContext> {
      const mod = await versionMod(database, versionId)
      if (!mod) throw new HttpError(409, 'version is not an email-ready approval')
      return {
        noun: NOUN,
        title: mod.title,
        change: await approvedChange(database, mod.id, mod.versionNumber),
        pagePath: modPath(encodeURIComponent(mod.slug)),
        live: mod.status === 'published',
      }
    },

    async rejectionContext(database, versionId): Promise<RejectionContext | null> {
      const mod = await versionMod(database, versionId)
      if (!mod || mod.status === 'removed') return null
      const [latest] = await database
        .select({ id: modVersions.id })
        .from(modVersions)
        .where(eq(modVersions.modId, mod.id))
        .orderBy(desc(modVersions.versionNumber))
        .limit(1)
      if (latest?.id !== versionId) return null
      const change: ReviewedChange = mod.status === 'published' ? 'update' : 'submission'
      const slug = encodeURIComponent(mod.slug)
      return {
        noun: NOUN,
        title: mod.title,
        change,
        nextStepPath:
          change === 'submission'
            ? `/submit?kind=mod&resubmit=${slug}`
            : `/submit?kind=mod&update=${slug}`,
      }
    },
  }
}
