import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs, user } from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { HttpError } from '@/lib/http'
import {
  type ApprovalEmailInput,
  type SendApprovalEmail,
  sendApprovalEmail,
} from './approval-email'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export type ApprovalEmailStatus = 'pending' | 'sent' | 'failed' | 'unavailable'
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
    const [ver] = await tx
      .update(configVersions)
      .set({
        status: 'approved',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        approvalEmailStatus: 'pending',
        approvalEmailId: null,
        approvalEmailError: null,
        approvalEmailSentAt: null,
      })
      .where(and(eq(configVersions.id, versionId), eq(configVersions.status, 'pending')))
      .returning()
    if (!ver) throw new HttpError(409, 'version not in a reviewable (pending) state')
    const [cfg] = await tx
      .select({ tags: configs.tags })
      .from(configs)
      .where(eq(configs.id, ver.configId))
    const allTags = computeAllTags({
      curatedTags: cfg?.tags ?? [],
      interpreter: ver.interpreter,
      networkHosts: ver.networkHosts ?? [],
      readsClaudeToken: ver.readsClaudeToken ?? false,
    })
    await tx
      .update(configs)
      .set({ status: 'published', currentVersionId: ver.id, allTags })
      .where(eq(configs.id, ver.configId))
  })
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
      title: configs.title,
      slug: configs.slug,
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
  if (!row.emailVerified) {
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

  const input: ApprovalEmailInput = {
    versionId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    title: row.title,
    slug: row.slug,
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
          inArray(configVersions.approvalEmailStatus, UNSENT_APPROVAL_EMAIL_STATUSES),
        ),
      )
    return 'sent'
  } catch {
    const [updated] = await database
      .update(configVersions)
      .set({
        approvalEmailStatus: 'failed',
        approvalEmailError: 'Email delivery failed',
        approvalEmailSentAt: null,
      })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'approved'),
          inArray(configVersions.approvalEmailStatus, UNSENT_APPROVAL_EMAIL_STATUSES),
        ),
      )
      .returning({ id: configVersions.id })
    return updated ? 'failed' : 'sent'
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
