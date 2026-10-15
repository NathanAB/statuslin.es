import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { submissions, user } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { updateReviewState } from '@/submissions/review-state'
import {
  type ApprovalEmailInput,
  type SendApprovalEmail,
  sendApprovalEmail,
} from './approval-email'
import { reviewKind } from './kinds/kind'
import type { ModReviewGitHub } from './kinds/mod'
import { ReviewEmailProviderError } from './review-email'

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

/** Runs the kind's checks, then makes the version live and marks it approved in one transaction. */
export async function approveVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  github?: ModReviewGitHub,
): Promise<void> {
  const [submission] = await database
    .select({ kind: submissions.kind })
    .from(submissions)
    .where(eq(submissions.id, versionId))
  if (!submission) throw new HttpError(409, 'version not in a reviewable (pending) state')
  const publish = await reviewKind(submission.kind, github).prepareApproval(database, versionId)
  await database.transaction(async (tx) => {
    const reviewedAt = new Date()
    // The kind's locks come before the submission's, so a refused approval rolls the publish back.
    await publish(tx, reviewedAt)
    const [approved] = await updateReviewState(
      tx,
      {
        status: 'approved',
        reviewedBy: reviewerId,
        reviewedAt,
        approvalEmailStatus: 'pending',
        approvalEmailId: null,
        approvalEmailError: null,
        approvalEmailSentAt: null,
      },
      (t) => and(eq(t.id, versionId), eq(t.status, 'pending')),
    )
    if (!approved) throw new HttpError(409, 'version not in a reviewable (pending) state')
  })
}

async function deliverApprovalEmail(
  database: Db,
  versionId: string,
  send: SendApprovalEmail,
): Promise<ApprovalEmailStatus> {
  const [row] = await database
    .select({
      kind: submissions.kind,
      versionStatus: submissions.status,
      emailStatus: submissions.approvalEmailStatus,
      authorName: user.name,
      authorEmail: user.email,
      emailVerified: user.emailVerified,
    })
    .from(submissions)
    .innerJoin(user, eq(user.id, submissions.submittedBy))
    .where(eq(submissions.id, versionId))
  if (row?.versionStatus !== 'approved') {
    throw new HttpError(409, 'version is not an email-ready approval')
  }
  if (row.emailStatus === 'sent') {
    throw new HttpError(409, 'approval email already sent')
  }
  if (!UNSENT_APPROVAL_EMAIL_STATUSES.some((status) => status === row.emailStatus)) {
    throw new HttpError(409, 'approval email is not pending delivery')
  }
  const approval = await reviewKind(row.kind).approvalContext(database, versionId)
  if (!row.emailVerified || !approval.live) {
    const [updated] = await updateReviewState(
      database,
      { approvalEmailStatus: 'unavailable', approvalEmailError: null },
      (t) =>
        and(
          eq(t.id, versionId),
          eq(t.status, 'approved'),
          inArray(t.approvalEmailStatus, UNSENT_APPROVAL_EMAIL_STATUSES),
        ),
    )
    return updated ? 'unavailable' : 'sent'
  }

  const [claimed] = await updateReviewState(
    database,
    { approvalEmailStatus: 'sending', approvalEmailError: null },
    (t) =>
      and(
        eq(t.id, versionId),
        eq(t.status, 'approved'),
        inArray(t.approvalEmailStatus, UNSENT_APPROVAL_EMAIL_STATUSES),
      ),
  )
  if (!claimed) throw new HttpError(409, 'approval email delivery is already in progress')

  const input: ApprovalEmailInput = {
    versionId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    title: approval.title,
    noun: approval.noun,
    pagePath: approval.pagePath,
    kind: approval.change,
  }
  try {
    const result = await send(input)
    await updateReviewState(
      database,
      {
        approvalEmailStatus: 'sent',
        approvalEmailId: result.id,
        approvalEmailError: null,
        approvalEmailSentAt: new Date(),
      },
      (t) =>
        and(eq(t.id, versionId), eq(t.status, 'approved'), eq(t.approvalEmailStatus, 'sending')),
    )
    return 'sent'
  } catch (error) {
    const delivery = error instanceof ReviewEmailProviderError ? 'failed' : 'ambiguous'
    const [updated] = await updateReviewState(
      database,
      {
        approvalEmailStatus: delivery,
        approvalEmailError:
          delivery === 'failed' ? 'Email delivery failed' : 'Email delivery could not be confirmed',
        approvalEmailSentAt: null,
      },
      (t) =>
        and(eq(t.id, versionId), eq(t.status, 'approved'), eq(t.approvalEmailStatus, 'sending')),
    )
    return updated ? delivery : 'sent'
  }
}

export async function approveAndEmailVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  send: SendApprovalEmail = sendApprovalEmail,
  github?: ModReviewGitHub,
): Promise<{ delivery: ApprovalEmailStatus }> {
  await approveVersion(database, versionId, reviewerId, github)
  return { delivery: await deliverApprovalEmail(database, versionId, send) }
}

export async function retryApprovalEmail(
  database: Db,
  versionId: string,
  send: SendApprovalEmail = sendApprovalEmail,
): Promise<{ delivery: ApprovalEmailStatus }> {
  return { delivery: await deliverApprovalEmail(database, versionId, send) }
}
