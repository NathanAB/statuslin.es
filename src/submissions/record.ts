import { and, count, eq, gt, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type SubmissionKind, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const SUBMISSION_RATE_LIMIT = 3 // max submissions per submitter per rate window
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour in milliseconds
const SUPERSEDABLE_REJECTION_EMAIL_STATUSES = [
  'pending',
  'failed',
  'unavailable',
  'ambiguous',
] as const

export async function assertUnderRateLimit(database: Db, submittedBy: string): Promise<void> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS)
  const [recent] = await database
    .select({ count: count() })
    .from(submissions)
    .where(and(eq(submissions.submittedBy, submittedBy), gt(submissions.createdAt, windowStart)))
  if ((recent?.count ?? 0) >= SUBMISSION_RATE_LIMIT) {
    throw new HttpError(429, 'Rate limit: too many submissions, try again later')
  }
}

/** Opens review of a newly written version. Its id is the version's id (ADR 0007). */
export async function insertPendingSubmission(
  database: Pick<Db, 'insert'>,
  submission: { kind: SubmissionKind; versionId: string; submittedBy: string },
): Promise<void> {
  const { kind, versionId, submittedBy } = submission
  await database.insert(submissions).values({
    id: versionId,
    kind,
    ...(kind === 'status_line' ? { configVersionId: versionId } : { modVersionId: versionId }),
    submittedBy,
    status: 'pending',
  })
}

/** Marks the still-pending submissions among `versionIds` superseded, returning their ids. */
export async function supersedePending(
  database: Pick<Db, 'update'>,
  versionIds: string[],
): Promise<string[]> {
  if (versionIds.length === 0) return []
  const superseded = await database
    .update(submissions)
    .set({ status: 'superseded' })
    .where(and(inArray(submissions.id, versionIds), eq(submissions.status, 'pending')))
    .returning({ id: submissions.id })
  return superseded.map((row) => row.id)
}

/** Withdraws a rejection email that hasn't gone out, once a newer submission replaces it. */
export async function supersedeRejectionEmail(
  database: Pick<Db, 'update'>,
  submission: { id: string; rejectionEmailStatus: string | null },
): Promise<void> {
  if (submission.rejectionEmailStatus === 'sending') {
    throw new HttpError(409, 'wait for rejection email delivery to finish before submitting again')
  }
  if (
    !SUPERSEDABLE_REJECTION_EMAIL_STATUSES.some(
      (status) => status === submission.rejectionEmailStatus,
    )
  ) {
    return
  }
  const [superseded] = await database
    .update(submissions)
    .set({ rejectionEmailStatus: 'superseded', rejectionEmailError: null })
    .where(
      and(
        eq(submissions.id, submission.id),
        inArray(submissions.rejectionEmailStatus, SUPERSEDABLE_REJECTION_EMAIL_STATUSES),
      ),
    )
    .returning({ id: submissions.id })
  if (!superseded) {
    throw new HttpError(409, 'wait for rejection email delivery to finish before submitting again')
  }
}
