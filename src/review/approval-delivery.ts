import { and, eq, inArray, lt } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs, user } from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { HttpError } from '@/lib/http'
import {
  type ApprovalEmailInput,
  type SendApprovalEmail,
  sendApprovalEmail,
} from './approval-email'
import { ReviewEmailProviderError, type ReviewedChange } from './review-email'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export type ApprovalEmailStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unavailable'
  | 'ambiguous'
const UNSENT_APPROVAL_EMAIL_STATUSES = ['pending', 'failed', 'unavailable'] as const

export async function approveVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
): Promise<void> {
  await database.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(renderJobs)
      .where(eq(renderJobs.configVersionId, versionId))
    if (job?.status !== 'done') throw new HttpError(409, 'version not rendered')
    const [target] = await tx
      .select({ configId: configVersions.configId })
      .from(configVersions)
      .where(eq(configVersions.id, versionId))
    if (!target) throw new HttpError(409, 'version not in a reviewable (pending) state')
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
    const reviewedAt = new Date()
    const [ver] = await tx
      .update(configVersions)
      .set({
        status: 'approved',
        reviewedBy: reviewerId,
        reviewedAt,
        approvalEmailStatus: 'pending',
        approvalEmailId: null,
        approvalEmailError: null,
        approvalEmailSentAt: null,
      })
      .where(and(eq(configVersions.id, versionId), eq(configVersions.status, 'pending')))
      .returning()
    if (!ver) throw new HttpError(409, 'version not in a reviewable (pending) state')
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
  })
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
    .where(
      and(
        eq(configVersions.configId, configId),
        eq(configVersions.status, 'approved'),
        lt(configVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1)
  return earlier ? 'update' : 'submission'
}

async function deliverApprovalEmail(
  database: Db,
  versionId: string,
  send: SendApprovalEmail,
): Promise<ApprovalEmailStatus> {
  const [row] = await database
    .select({
      versionStatus: configVersions.status,
      emailStatus: configVersions.approvalEmailStatus,
      authorName: user.name,
      authorEmail: user.email,
      emailVerified: user.emailVerified,
      title: configVersions.title,
      slug: configs.slug,
      configId: configs.id,
      configStatus: configs.status,
      versionNumber: configVersions.versionNumber,
    })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(user, eq(user.id, configs.authorId))
    .where(eq(configVersions.id, versionId))
  if (row?.versionStatus !== 'approved') {
    throw new HttpError(409, 'version is not an email-ready approval')
  }
  if (row.emailStatus === 'sent') {
    throw new HttpError(409, 'approval email already sent')
  }
  if (!UNSENT_APPROVAL_EMAIL_STATUSES.some((status) => status === row.emailStatus)) {
    throw new HttpError(409, 'approval email is not pending delivery')
  }
  const kind = await approvedChange(database, row.configId, row.versionNumber)
  // A config taken down while its update waited isn't live, so the email would be false.
  if (!row.emailVerified || row.configStatus !== 'published') {
    const [updated] = await database
      .update(configVersions)
      .set({ approvalEmailStatus: 'unavailable', approvalEmailError: null })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'approved'),
          inArray(configVersions.approvalEmailStatus, UNSENT_APPROVAL_EMAIL_STATUSES),
        ),
      )
      .returning({ id: configVersions.id })
    return updated ? 'unavailable' : 'sent'
  }

  const [claimed] = await database
    .update(configVersions)
    .set({ approvalEmailStatus: 'sending', approvalEmailError: null })
    .where(
      and(
        eq(configVersions.id, versionId),
        eq(configVersions.status, 'approved'),
        inArray(configVersions.approvalEmailStatus, UNSENT_APPROVAL_EMAIL_STATUSES),
      ),
    )
    .returning({ id: configVersions.id })
  if (!claimed) throw new HttpError(409, 'approval email delivery is already in progress')

  const input: ApprovalEmailInput = {
    versionId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    title: row.title,
    slug: row.slug,
    kind,
  }
  try {
    const result = await send(input)
    await database
      .update(configVersions)
      .set({
        approvalEmailStatus: 'sent',
        approvalEmailId: result.id,
        approvalEmailError: null,
        approvalEmailSentAt: new Date(),
      })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'approved'),
          eq(configVersions.approvalEmailStatus, 'sending'),
        ),
      )
    return 'sent'
  } catch (error) {
    const delivery = error instanceof ReviewEmailProviderError ? 'failed' : 'ambiguous'
    const [updated] = await database
      .update(configVersions)
      .set({
        approvalEmailStatus: delivery,
        approvalEmailError:
          delivery === 'failed' ? 'Email delivery failed' : 'Email delivery could not be confirmed',
        approvalEmailSentAt: null,
      })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'approved'),
          eq(configVersions.approvalEmailStatus, 'sending'),
        ),
      )
      .returning({ id: configVersions.id })
    return updated ? delivery : 'sent'
  }
}

export async function approveAndEmailVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  send: SendApprovalEmail = sendApprovalEmail,
): Promise<{ delivery: ApprovalEmailStatus }> {
  await approveVersion(database, versionId, reviewerId)
  return { delivery: await deliverApprovalEmail(database, versionId, send) }
}

export async function retryApprovalEmail(
  database: Db,
  versionId: string,
  send: SendApprovalEmail = sendApprovalEmail,
): Promise<{ delivery: ApprovalEmailStatus }> {
  return { delivery: await deliverApprovalEmail(database, versionId, send) }
}
