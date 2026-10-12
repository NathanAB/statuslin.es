import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { SubmissionKind } from '@/db/schema'
import { HttpError } from '@/lib/http'
import type { ReviewedChange } from '../review-email'
import { statusLineReview } from './status-line'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** What a review email says about the version it decided. */
interface ReviewedVersion {
  /** What was reviewed, as the email names it: 'status line' or 'mod'. */
  noun: string
  title: string
  change: ReviewedChange
}

export interface ApprovalContext extends ReviewedVersion {
  /** The page the version is live on. */
  pagePath: string
  /** False once the approved item was taken down, so an email saying it is live would be false. */
  live: boolean
}

export interface RejectionContext extends ReviewedVersion {
  /** Where the submitter fixes a rejected submission, or sends a new update. */
  nextStepPath: string
}

/** Makes an approved version live, inside the transaction that marks it approved. */
export type Publish = (tx: Db, reviewedAt: Date) => Promise<void>

/** What differs between status lines and mods in review; the rest is shared (ADR 0007). */
export interface ReviewKind {
  /**
   * Checks, before the approval transaction, that the version can go live (a 409 when not), and
   * returns the step that makes it live. The step takes its locks before the submission's, in the
   * order submitting an update takes them.
   */
  prepareApproval(db: Db, versionId: string): Promise<Publish>
  approvalContext(db: Db, versionId: string): Promise<ApprovalContext>
  /** Null when a newer version or a later state left the rejection out of date. */
  rejectionContext(db: Db, versionId: string): Promise<RejectionContext | null>
}

export function reviewKind(kind: SubmissionKind): ReviewKind {
  if (kind === 'status_line') return statusLineReview
  throw new HttpError(409, 'mods cannot be reviewed here yet')
}
