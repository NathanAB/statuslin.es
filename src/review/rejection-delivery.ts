import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { submissions, user } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { updateReviewState } from '@/submissions/review-state'
import { reviewKind } from './kinds/kind'
import {
  type RejectionEmailInput,
  type SendRejectionEmail,
  sendRejectionEmail,
} from './rejection-email'
import { ReviewEmailProviderError } from './review-email'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const REJECTION_REASON_MAX = 2000
export type RejectionEmailStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unavailable'
  | 'ambiguous'
  | 'superseded'
const UNSENT_REJECTION_EMAIL_STATUSES = ['pending', 'failed', 'unavailable'] as const

export async function rejectVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  reason: string,
): Promise<void> {
  const trimmedReason = reason.trim()
  if (!trimmedReason || trimmedReason.length > REJECTION_REASON_MAX) {
    throw new HttpError(
      400,
      `rejection reason must be between 1 and ${REJECTION_REASON_MAX} characters`,
    )
  }
  const [row] = await updateReviewState(
    database,
    {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: trimmedReason,
      rejectionEmailStatus: 'pending',
      rejectionEmailId: null,
      rejectionEmailError: null,
      rejectionEmailSentAt: null,
    },
    (t) => and(eq(t.id, versionId), eq(t.status, 'pending')),
  )
  if (!row) throw new HttpError(409, 'version not in a reviewable (pending) state')
}

function assertRetryableRejectionEmailStatus(status: string | null): void {
  if (UNSENT_REJECTION_EMAIL_STATUSES.some((candidate) => candidate === status)) return
  if (status === 'sent') throw new HttpError(409, 'rejection email already sent')
  throw new HttpError(409, 'rejection email is not pending delivery')
}

async function deliverRejectionEmail(
  database: Db,
  versionId: string,
  send: SendRejectionEmail,
): Promise<RejectionEmailStatus> {
  const [row] = await database
    .select({
      kind: submissions.kind,
      versionStatus: submissions.status,
      emailStatus: submissions.rejectionEmailStatus,
      reason: submissions.rejectionReason,
      authorName: user.name,
      authorEmail: user.email,
      emailVerified: user.emailVerified,
    })
    .from(submissions)
    .innerJoin(user, eq(user.id, submissions.submittedBy))
    .where(eq(submissions.id, versionId))
  if (row?.versionStatus !== 'rejected' || !row.reason) {
    throw new HttpError(409, 'version is not an email-ready rejection')
  }
  const rejection = await reviewKind(row.kind).rejectionContext(database, versionId)
  if (!rejection) {
    throw new HttpError(409, 'rejection email was superseded by a newer submission state')
  }
  assertRetryableRejectionEmailStatus(row.emailStatus)
  if (!row.emailVerified) {
    const [updated] = await updateReviewState(
      database,
      { rejectionEmailStatus: 'unavailable', rejectionEmailError: null },
      (t) =>
        and(
          eq(t.id, versionId),
          eq(t.status, 'rejected'),
          inArray(t.rejectionEmailStatus, UNSENT_REJECTION_EMAIL_STATUSES),
        ),
    )
    return updated ? 'unavailable' : 'sent'
  }

  const [claimed] = await updateReviewState(
    database,
    { rejectionEmailStatus: 'sending', rejectionEmailError: null },
    (t) =>
      and(
        eq(t.id, versionId),
        eq(t.status, 'rejected'),
        inArray(t.rejectionEmailStatus, UNSENT_REJECTION_EMAIL_STATUSES),
      ),
  )
  if (!claimed) throw new HttpError(409, 'rejection email delivery is already in progress')

  const input: RejectionEmailInput = {
    versionId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    title: rejection.title,
    reason: row.reason,
    noun: rejection.noun,
    nextStepPath: rejection.nextStepPath,
    kind: rejection.change,
  }
  try {
    const result = await send(input)
    await updateReviewState(
      database,
      {
        rejectionEmailStatus: 'sent',
        rejectionEmailId: result.id,
        rejectionEmailError: null,
        rejectionEmailSentAt: new Date(),
      },
      (t) =>
        and(eq(t.id, versionId), eq(t.status, 'rejected'), eq(t.rejectionEmailStatus, 'sending')),
    )
    return 'sent'
  } catch (error) {
    const delivery = error instanceof ReviewEmailProviderError ? 'failed' : 'ambiguous'
    const [updated] = await updateReviewState(
      database,
      {
        rejectionEmailStatus: delivery,
        rejectionEmailError:
          delivery === 'failed' ? 'Email delivery failed' : 'Email delivery could not be confirmed',
        rejectionEmailSentAt: null,
      },
      (t) =>
        and(eq(t.id, versionId), eq(t.status, 'rejected'), eq(t.rejectionEmailStatus, 'sending')),
    )
    return updated ? delivery : 'sent'
  }
}

export async function rejectAndEmailVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  reason: string,
  send: SendRejectionEmail = sendRejectionEmail,
): Promise<{ delivery: RejectionEmailStatus }> {
  await rejectVersion(database, versionId, reviewerId, reason)
  return { delivery: await deliverRejectionEmail(database, versionId, send) }
}

export async function retryRejectionEmail(
  database: Db,
  versionId: string,
  send: SendRejectionEmail = sendRejectionEmail,
): Promise<{ delivery: RejectionEmailStatus }> {
  return { delivery: await deliverRejectionEmail(database, versionId, send) }
}
