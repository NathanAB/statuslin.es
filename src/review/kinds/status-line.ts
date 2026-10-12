import { and, desc, eq, lt } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs, submissions } from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { HttpError } from '@/lib/http'
import type { ReviewedChange } from '../review-email'
import type { ApprovalContext, RejectionContext, ReviewKind } from './kind'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const NOUN = 'status line'
const NOT_PENDING = 'version not in a reviewable (pending) state'

/** Points the config at the version and recomputes its tags; a draft's first approval publishes it. */
async function publish(tx: Db, versionId: string, reviewedAt: Date): Promise<void> {
  const [target] = await tx
    .select({ configId: configVersions.configId })
    .from(configVersions)
    .where(eq(configVersions.id, versionId))
  if (!target) throw new HttpError(409, NOT_PENDING)
  // Lock the config before the version, the order submitting an update takes them in, so a
  // takedown or a newer update can't interleave with the pointer move.
  const [cfg] = await tx
    .select({
      tags: configs.tags,
      status: configs.status,
      currentVersionId: configs.currentVersionId,
    })
    .from(configs)
    .where(eq(configs.id, target.configId))
    .for('update')
  if (!cfg) throw new HttpError(409, 'config not found')
  const [ver] = await tx
    .select()
    .from(configVersions)
    .where(eq(configVersions.id, versionId))
    .for('update')
  if (!ver) throw new HttpError(409, NOT_PENDING)
  const allTags = computeAllTags({
    curatedTags: cfg.tags,
    interpreter: ver.interpreter,
    networkHosts: ver.networkHosts ?? [],
    readsClaudeToken: ver.readsClaudeToken ?? false,
  })
  // An update only moves the live pointer: status is left alone, so a takedown sticks.
  const firstPublish =
    cfg.status === 'draft' && cfg.currentVersionId === null
      ? { status: 'published', firstPublishedAt: reviewedAt }
      : {}
  await tx
    .update(configs)
    .set({ currentVersionId: ver.id, allTags, ...firstPublish })
    .where(eq(configs.id, ver.configId))
}

/** An approval is an update when an earlier version of the config was approved, so went live. */
async function approvedChange(
  database: Db,
  configId: string,
  versionNumber: number,
): Promise<ReviewedChange> {
  const [earlier] = await database
    .select({ id: configVersions.id })
    .from(configVersions)
    .innerJoin(submissions, eq(submissions.configVersionId, configVersions.id))
    .where(
      and(
        eq(configVersions.configId, configId),
        eq(submissions.status, 'approved'),
        lt(configVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1)
  return earlier ? 'update' : 'submission'
}

/** What a still-current rejection is about, with the title its email names: the rejected
 * version's own for a never-published config, the live version's for an update. Null when a
 * newer version exists or the config left the state the rejection applies to. */
async function currentRejection(
  database: Db,
  row: { configId: string; configStatus: string; currentVersionId: string | null; title: string },
  versionId: string,
): Promise<{ kind: ReviewedChange; title: string } | null> {
  const [latest] = await database
    .select({ id: configVersions.id })
    .from(configVersions)
    .where(eq(configVersions.configId, row.configId))
    .orderBy(desc(configVersions.versionNumber))
    .limit(1)
  if (latest?.id !== versionId) return null
  if (row.configStatus === 'draft' && row.currentVersionId === null) {
    return { kind: 'submission', title: row.title }
  }
  if (row.configStatus !== 'published' || row.currentVersionId === null) return null
  const [live] = await database
    .select({ title: configVersions.title })
    .from(configVersions)
    .where(eq(configVersions.id, row.currentVersionId))
  return live ? { kind: 'update', title: live.title } : null
}

async function versionConfig(database: Db, versionId: string) {
  const [row] = await database
    .select({
      configId: configs.id,
      configStatus: configs.status,
      currentVersionId: configs.currentVersionId,
      slug: configs.slug,
      title: configVersions.title,
      versionNumber: configVersions.versionNumber,
    })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .where(eq(configVersions.id, versionId))
  return row
}

export const statusLineReview: ReviewKind = {
  async prepareApproval(database, versionId) {
    const [job] = await database
      .select({ status: renderJobs.status })
      .from(renderJobs)
      .where(eq(renderJobs.configVersionId, versionId))
    if (job?.status !== 'done') throw new HttpError(409, 'version not rendered')
    return (tx, reviewedAt) => publish(tx, versionId, reviewedAt)
  },

  async approvalContext(database, versionId): Promise<ApprovalContext> {
    const row = await versionConfig(database, versionId)
    if (!row) throw new HttpError(409, 'version is not an email-ready approval')
    return {
      noun: NOUN,
      title: row.title,
      change: await approvedChange(database, row.configId, row.versionNumber),
      pagePath: `/c/${encodeURIComponent(row.slug)}`,
      // A config taken down while its update waited isn't live, so the email would be false.
      live: row.configStatus === 'published',
    }
  },

  async rejectionContext(database, versionId): Promise<RejectionContext | null> {
    const row = await versionConfig(database, versionId)
    if (!row) return null
    const rejection = await currentRejection(database, row, versionId)
    if (!rejection) return null
    const slug = encodeURIComponent(row.slug)
    return {
      noun: NOUN,
      title: rejection.title,
      change: rejection.kind,
      nextStepPath:
        rejection.kind === 'submission' ? `/submit?resubmit=${slug}` : `/submit?update=${slug}`,
    }
  },
}
