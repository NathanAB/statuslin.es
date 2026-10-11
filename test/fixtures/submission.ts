import { eq, getTableColumns } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof schema>

/** The submission a status line version is reviewed as. Pending, as submit writes it, unless
 * `review` says otherwise. */
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
