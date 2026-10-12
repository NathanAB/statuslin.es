import { and, desc, eq, isNull, lt } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModStatus, mods, modVersions, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { modPath } from '@/lib/site'
import type { GitHub } from '@/mods/github'
import {
  alreadyCurrentGuard,
  compareBase,
  currentChangedGuard,
  loadCurrentVersion,
  loadVersions,
  publishGuards,
  removedGuard,
} from '@/mods/publish'
import type { ReviewedChange } from '../review-email'
import type { ApprovalContext, Publish, RejectionContext, ReviewKind } from './kind'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** What approving a mod asks GitHub, as publish-mod.ts does. */
export type ModReviewGitHub = Pick<GitHub, 'commitIsOnDefaultBranch' | 'filesChanged'>

const NOUN = 'mod'
const NOT_PENDING = 'version not in a reviewable (pending) state'

async function versionMod(database: Db, versionId: string) {
  const [row] = await database
    .select({
      id: mods.id,
      slug: mods.slug,
      title: mods.title,
      status: mods.status,
      description: mods.description,
      currentVersionId: mods.currentVersionId,
      versionNumber: modVersions.versionNumber,
    })
    .from(modVersions)
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .where(eq(modVersions.id, versionId))
  return row
}

/**
 * Moves the mod's live pointer to the version, publishing a draft, but only while the mod's status
 * and pointer are what the approval checked against; otherwise a 409 says what changed. Writes only
 * through `tx`.
 */
function publishStep(
  slug: string,
  modId: string,
  versionId: string,
  read: { status: ModStatus; currentVersionId: string | null },
): Publish {
  return async (tx) => {
    const moved = await tx
      .update(mods)
      .set({ currentVersionId: versionId, status: 'published' })
      .where(
        and(
          eq(mods.id, modId),
          eq(mods.status, read.status),
          read.currentVersionId
            ? eq(mods.currentVersionId, read.currentVersionId)
            : isNull(mods.currentVersionId),
        ),
      )
      .returning({ id: mods.id })
    if (moved.length > 0) return
    const [mod] = await tx.select({ status: mods.status }).from(mods).where(eq(mods.id, modId))
    const guard = mod?.status === 'removed' ? removedGuard(slug) : currentChangedGuard(slug)
    throw new HttpError(409, guard.message)
  }
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
      const base = compareBase(current, target)
      const guards = publishGuards({
        slug: mod.slug,
        modStatus: mod.status,
        description: mod.description,
        target,
        current,
        onDefaultBranch: await github.commitIsOnDefaultBranch(target.repoUrl, target.commitSha),
        filesChanged: base
          ? await github.filesChanged(target.repoUrl, base.commitSha, target.commitSha)
          : null,
      })
      const refusals = guards.filter((guard) => guard.level === 'refuse')
      if (refusals.length > 0) {
        throw new HttpError(409, refusals.map((guard) => guard.message).join('; '))
      }
      return publishStep(mod.slug, mod.id, versionId, mod)
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
