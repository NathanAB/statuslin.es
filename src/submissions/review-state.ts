import type { SQL } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configVersions, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** The review columns `submissions` took over from `config_versions`, which still has them under
 * the same names until the release that drops them (ADR 0007). */
export const REVIEW_STATE_COLUMNS = [
  'status',
  'reviewedBy',
  'reviewedAt',
  'rejectionReason',
  'rejectionEmailStatus',
  'rejectionEmailId',
  'rejectionEmailError',
  'rejectionEmailSentAt',
  'approvalEmailStatus',
  'approvalEmailId',
  'approvalEmailError',
  'approvalEmailSentAt',
] as const

export type ReviewState = Partial<
  Pick<typeof submissions.$inferInsert, (typeof REVIEW_STATE_COLUMNS)[number]>
>
type ReviewTable = typeof submissions | typeof configVersions

/**
 * Writes the review state of the submissions `where` matches. A status line's also goes to its old
 * `config_versions` columns, in the same transaction, so an image from before the move can still be
 * rolled back to; mods never had those columns. `where`
 * is built once per table from columns both share. Both must match the same versions; when they
 * don't, a machine on the old code changed the version during a deploy, so the write is refused
 * rather than applied to stale state. `scripts/reconcile-submissions.ts` copies that change over.
 * Delete the `config_versions` half with the columns.
 */
export async function updateReviewState(
  database: Pick<Db, 'transaction'>,
  state: ReviewState,
  where: (table: ReviewTable) => SQL | undefined,
): Promise<string[]> {
  const whereOld = where(configVersions)
  const whereNew = where(submissions)
  if (!whereOld || !whereNew) throw new Error('updateReviewState needs a where clause')
  return database.transaction(async (tx) => {
    // config_versions first: approving locks it before the submission, so this keeps one lock order.
    const old = await tx
      .update(configVersions)
      .set(state)
      .where(whereOld)
      .returning({ id: configVersions.id })
    const updated = await tx
      .update(submissions)
      .set(state)
      .where(whereNew)
      .returning({ id: submissions.id, kind: submissions.kind })
    const ids = updated.map((row) => row.id).sort()
    const statusLineIds = updated.filter((row) => row.kind === 'status_line').map((row) => row.id)
    const oldIds = old.map((row) => row.id).sort()
    if (statusLineIds.sort().join() !== oldIds.join()) {
      throw new HttpError(
        409,
        'this version changed during a deploy; try again once it has finished',
      )
    }
    return ids
  })
}
