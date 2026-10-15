import { eq, getTableColumns } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { REVIEW_STATE_COLUMNS, type ReviewState } from '@/submissions/review-state'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof schema>

/** The submission a status line version is reviewed as. Pending, as submit writes it, unless
 * `review` says otherwise, which also lands on the version's old review columns, as the app writes it. */
export async function insertSubmission(
  db: Db,
  versionId: string,
  submittedBy: string,
  review: Partial<typeof schema.submissions.$inferInsert> = {},
): Promise<void> {
  await db.insert(schema.submissions).values({
    id: versionId,
    kind: 'status_line',
    configVersionId: versionId,
    submittedBy,
    ...review,
  })
  const state = Object.fromEntries(
    REVIEW_STATE_COLUMNS.filter((column) => column in review).map((column) => [
      column,
      review[column],
    ]),
  )
  if (Object.keys(state).length > 0) {
    await db.update(schema.configVersions).set(state).where(eq(schema.configVersions.id, versionId))
  }
}

/** Sets a status line version's review state on its submission and its old review columns, as the
 * app writes it. */
export async function setReviewState(db: Db, versionId: string, state: ReviewState): Promise<void> {
  await db.update(schema.submissions).set(state).where(eq(schema.submissions.id, versionId))
  await db.update(schema.configVersions).set(state).where(eq(schema.configVersions.id, versionId))
}

const { submissions } = schema

/** Config versions, each with its submission's review state, to filter and sort like a select. */
export function selectVersionsWithReview(db: Db) {
  return db
    .select({
      ...getTableColumns(schema.configVersions),
      status: submissions.status,
      reviewedBy: submissions.reviewedBy,
      reviewedAt: submissions.reviewedAt,
      rejectionReason: submissions.rejectionReason,
      rejectionEmailStatus: submissions.rejectionEmailStatus,
      rejectionEmailId: submissions.rejectionEmailId,
      rejectionEmailError: submissions.rejectionEmailError,
      rejectionEmailSentAt: submissions.rejectionEmailSentAt,
      approvalEmailStatus: submissions.approvalEmailStatus,
      approvalEmailId: submissions.approvalEmailId,
      approvalEmailError: submissions.approvalEmailError,
      approvalEmailSentAt: submissions.approvalEmailSentAt,
    })
    .from(schema.configVersions)
    .innerJoin(submissions, eq(submissions.configVersionId, schema.configVersions.id))
}
