import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { REVIEW_STATE_COLUMNS } from '@/submissions/review-state'

/**
 * Copy status line review state that machines still on the pre-#83 code wrote during a deploy into
 * `submissions`. Migration 0036 copies everything once, in the release_command, while those machines
 * are still serving; they keep writing `config_versions` only until the deploy replaces them. A
 * version they created has no submission, so it's missing from /admin, and a version they decided
 * still reads pending. The new code refuses review writes on either (409) until this has run.
 *
 * The new code writes review state to both tables (`updateReviewState`), so a difference means the
 * old code wrote it, and `config_versions` wins. Unless it's a change the old code can't make, which
 * only a build of #83 without that dual write (79858c3) could leave: a decided submission that
 * `config_versions` has as pending or decided another way, or email state moved on from one the old
 * code could still send from. Copying those back could undo a decision or re-arm a sent email, so
 * they're printed as conflicts and left alone for a human. Safe to run any number of times; a second
 * run finds nothing.
 *
 * AGENT USAGE — a dry run by default; nothing changes without `--apply`. Run it once the deploy has
 * replaced every machine, and again after rolling forward from a rollback past #83:
 *
 *   fly ssh console --app statuslines --command "bun run scripts/reconcile-submissions.ts"
 *   fly ssh console --app statuslines --command "bun run scripts/reconcile-submissions.ts --apply"
 *
 *   # Or from your machine against any env:
 *   DATABASE_URL=<env-url> bun run scripts/reconcile-submissions.ts [--apply]
 *
 * Exit code 0 when there's nothing left to copy, or it was copied; 1 on a conflict or any error.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>
type ReviewColumn = (typeof REVIEW_STATE_COLUMNS)[number]

export type ReviewDrift = {
  versionId: string
  slug: string
  versionNumber: number
  change: 'missing' | 'stale' | 'conflict'
  /** null when the version has no submission. */
  submissionStatus: string | null
  oldStatus: string
  /** The review columns whose values differ. */
  columns: ReviewColumn[]
}

const { configs, configVersions, submissions } = schema

function reviewColumnsOf<T extends typeof configVersions | typeof submissions>(
  table: T,
): Pick<T, ReviewColumn> {
  return Object.fromEntries(REVIEW_STATE_COLUMNS.map((column) => [column, table[column]])) as Pick<
    T,
    ReviewColumn
  >
}

const EMAIL_STATUS_COLUMNS = ['approvalEmailStatus', 'rejectionEmailStatus'] as const
// The email states the old code sends from; it moves a version's email on only from one of these.
const UNSENT_EMAIL_STATUSES: (string | null)[] = [null, 'pending', 'failed', 'unavailable']

/** Whether the old code could have written the differences: it decides only pending versions, and
 * moves an email on only from a state it could still send from. */
function oldCodeCouldHaveWritten(
  submission: {
    status: string
    approvalEmailStatus: string | null
    rejectionEmailStatus: string | null
  },
  oldStatus: string,
  columns: ReviewColumn[],
): boolean {
  if (submission.status !== 'pending' && submission.status !== oldStatus) return false
  return EMAIL_STATUS_COLUMNS.every(
    (column) => !columns.includes(column) || UNSENT_EMAIL_STATUSES.includes(submission[column]),
  )
}

function sameValue(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b
}

/** Every status line version whose submission is missing or differs from its old review columns. */
export async function findReviewDrift(db: Pick<Db, 'select'>): Promise<ReviewDrift[]> {
  const rows = await db
    .select({
      versionId: configVersions.id,
      slug: configs.slug,
      versionNumber: configVersions.versionNumber,
      old: reviewColumnsOf(configVersions),
      submission: reviewColumnsOf(submissions),
    })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .leftJoin(submissions, eq(submissions.configVersionId, configVersions.id))
    .orderBy(asc(configs.slug), asc(configVersions.versionNumber))
  return rows.flatMap(({ versionId, slug, versionNumber, old, submission }) => {
    const columns = REVIEW_STATE_COLUMNS.filter(
      (column) => !sameValue(old[column], submission?.[column] ?? null),
    )
    if (submission && columns.length === 0) return []
    const submissionStatus = submission?.status ?? null
    const change = !submission
      ? 'missing'
      : oldCodeCouldHaveWritten(submission, old.status, columns)
        ? 'stale'
        : 'conflict'
    return [
      { versionId, slug, versionNumber, change, submissionStatus, oldStatus: old.status, columns },
    ]
  })
}

/** Opens each missing submission and copies the old review columns onto it and onto each stale
 * one, leaving conflicts alone. Returns the drift it found, conflicts included. */
export async function reconcileSubmissions(db: Pick<Db, 'transaction'>): Promise<ReviewDrift[]> {
  return db.transaction(async (tx) => {
    // Holds off review writes, which take both tables, until the copy commits, so none lands
    // between finding a difference and copying it. Reads carry on.
    await tx.execute(sql`lock table ${configVersions}, ${submissions} in share row exclusive mode`)
    const drift = await findReviewDrift(tx)
    const missing = drift.filter((d) => d.change === 'missing').map((d) => d.versionId)
    if (missing.length > 0) {
      const opened = await tx
        .select({
          id: configVersions.id,
          authorId: configs.authorId,
          createdAt: configVersions.createdAt,
        })
        .from(configVersions)
        .innerJoin(configs, eq(configs.id, configVersions.configId))
        .where(inArray(configVersions.id, missing))
      await tx.insert(submissions).values(
        opened.map(({ id, authorId, createdAt }) => ({
          id,
          kind: 'status_line' as const,
          configVersionId: id,
          submittedBy: authorId,
          createdAt,
        })),
      )
    }
    const copied = drift.filter((d) => d.change !== 'conflict').map((d) => d.versionId)
    if (copied.length > 0) {
      const fromOldColumns = Object.fromEntries(
        REVIEW_STATE_COLUMNS.map((column): [ReviewColumn, SQL] => [
          column,
          sql`${configVersions[column]}`,
        ]),
      )
      await tx
        .update(submissions)
        .set(fromOldColumns)
        .from(configVersions)
        .where(
          and(eq(configVersions.id, submissions.configVersionId), inArray(submissions.id, copied)),
        )
    }
    return drift
  })
}

function describe(drift: ReviewDrift, applied: boolean): string {
  const version = `${drift.slug} v${drift.versionNumber}`
  if (drift.change === 'conflict') {
    return `CONFLICT ${version}: the submission is ${drift.submissionStatus}, but config_versions says ${drift.oldStatus}; left alone`
  }
  if (drift.change === 'missing') {
    return `${version}: no submission; ${applied ? 'opened' : 'would open'} one as ${drift.oldStatus}`
  }
  const status =
    drift.submissionStatus === drift.oldStatus
      ? drift.oldStatus
      : `${drift.submissionStatus} → ${drift.oldStatus}`
  return `${version} (${status}): ${applied ? 'copied' : 'would copy'} ${drift.columns.join(', ')}`
}

async function main(): Promise<boolean> {
  const apply = process.argv.slice(2).includes('--apply')
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    const drift = apply ? await reconcileSubmissions(db) : await findReviewDrift(db)
    for (const d of drift) console.log(`[reconcile-submissions] ${describe(d, apply)}`)
    const conflicts = drift.filter((d) => d.change === 'conflict').length
    const copies = drift.length - conflicts
    if (apply) {
      console.log(`[reconcile-submissions] copied ${copies}; ${conflicts} conflicts left alone`)
    } else if (copies > 0) {
      console.log(
        `[reconcile-submissions] dry run: nothing changed. Rerun with --apply to copy ${copies}.`,
      )
    } else {
      console.log(`[reconcile-submissions] nothing to copy; ${conflicts} conflicts`)
    }
    return conflicts === 0
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (clean) => process.exit(clean ? 0 : 1),
    (err) => {
      console.error(`[reconcile-submissions] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
