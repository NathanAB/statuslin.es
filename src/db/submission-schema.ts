import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import { modVersions } from './mod-schema'
import { configVersions } from './schema'

export type SubmissionKind = 'status_line' | 'mod'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'superseded'

/** The review state of one submitted version, for both kinds (ADR 0007). */
export const submissions = pgTable(
  'submissions',
  {
    /** The id of the version this reviews, so a `versionId` addresses its submission too. */
    id: uuid('id').primaryKey(),
    kind: text('kind').$type<SubmissionKind>().notNull(),
    configVersionId: uuid('config_version_id')
      .unique()
      .references(() => configVersions.id, { onDelete: 'cascade' }),
    modVersionId: uuid('mod_version_id')
      .unique()
      .references(() => modVersions.id, { onDelete: 'cascade' }),
    submittedBy: text('submitted_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<SubmissionStatus>().notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    rejectionEmailStatus: text('rejection_email_status'),
    rejectionEmailId: text('rejection_email_id'),
    rejectionEmailError: text('rejection_email_error'),
    rejectionEmailSentAt: timestamp('rejection_email_sent_at', { withTimezone: true }),
    approvalEmailStatus: text('approval_email_status'),
    approvalEmailId: text('approval_email_id'),
    approvalEmailError: text('approval_email_error'),
    approvalEmailSentAt: timestamp('approval_email_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The submit rate limit and /me read a submitter's rows by time.
    index('submissions_submitted_by_created_idx').on(t.submittedBy, t.createdAt),
    check(
      'submissions_id_is_version_id',
      sql`${t.id} = coalesce(${t.configVersionId}, ${t.modVersionId})`,
    ),
    check(
      'submissions_kind_version_check',
      sql`(${t.kind} = 'status_line' AND ${t.configVersionId} IS NOT NULL AND ${t.modVersionId} IS NULL) OR (${t.kind} = 'mod' AND ${t.modVersionId} IS NOT NULL AND ${t.configVersionId} IS NULL)`,
    ),
  ],
)
