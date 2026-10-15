import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { REVIEW_STATE_COLUMNS, type ReviewState } from '@/submissions/review-state'
import { findReviewDrift, reconcileSubmissions } from '../../scripts/reconcile-submissions'
import { insertSubmission } from '../fixtures/submission'

const AUTHOR = 'reconcile-author'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({ id: AUTHOR, name: 'Author', email: 'reconcile@test.com' })
})
afterAll(async () => {
  await client.close()
})
beforeEach(async () => {
  await db.delete(schema.configs)
})

/** A status line version as the pre-#83 code writes it: config_versions only, no submission. */
async function versionOnOldCode(slug: string, review: ReviewState = {}): Promise<string> {
  const [config] = await db.insert(schema.configs).values({ slug, authorId: AUTHOR }).returning()
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config!.id,
      versionNumber: 1,
      title: 'Title',
      source: 'echo hi',
      interpreter: 'bash',
      contentSha256: 'sha',
      ...review,
    })
    .returning()
  return version!.id
}

/** A version written by the new code, then changed by a machine still on the old code. */
async function changedOnOldCode(
  slug: string,
  submitted: ReviewState,
  oldCodeChange: ReviewState,
): Promise<string> {
  const versionId = await versionOnOldCode(slug)
  await insertSubmission(db, versionId, AUTHOR, submitted)
  await db
    .update(schema.configVersions)
    .set(oldCodeChange)
    .where(eq(schema.configVersions.id, versionId))
  return versionId
}

async function reviewColumns(versionId: string) {
  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, versionId))
  const [version] = await db
    .select()
    .from(schema.configVersions)
    .where(eq(schema.configVersions.id, versionId))
  const pick = (row: Record<string, unknown> | undefined) =>
    row && Object.fromEntries(REVIEW_STATE_COLUMNS.map((column) => [column, row[column]]))
  return { submission: pick(submission), version: pick(version), row: submission }
}

const approvedAndEmailed: ReviewState = {
  status: 'approved',
  reviewedBy: 'old-admin',
  reviewedAt: new Date('2026-10-11T12:00:00Z'),
  approvalEmailStatus: 'sent',
  approvalEmailId: 'email_1',
  approvalEmailSentAt: new Date('2026-10-11T12:00:01Z'),
}

describe('reconcileSubmissions', () => {
  it('opens the submission a version written on the old code is missing', async () => {
    const versionId = await versionOnOldCode('missing')

    await reconcileSubmissions(db)

    const { submission, version, row } = await reviewColumns(versionId)
    expect(row).toMatchObject({
      kind: 'status_line',
      configVersionId: versionId,
      submittedBy: AUTHOR,
      status: 'pending',
    })
    expect(submission).toEqual(version)
  })

  it('copies the review state of a version the old code decided before its submission existed', async () => {
    const versionId = await versionOnOldCode('missing-decided', approvedAndEmailed)

    await reconcileSubmissions(db)

    const { submission, version } = await reviewColumns(versionId)
    expect(submission).toEqual(version)
    expect(submission).toMatchObject({ status: 'approved', approvalEmailStatus: 'sent' })
  })

  it('copies a decision the old code made while the submission was pending', async () => {
    const versionId = await changedOnOldCode('decided', {}, approvedAndEmailed)

    await reconcileSubmissions(db)

    const { submission, version } = await reviewColumns(versionId)
    expect(submission).toEqual(version)
    expect(submission).toMatchObject({ status: 'approved', reviewedBy: 'old-admin' })
  })

  it('copies email state the old code changed on a decided version', async () => {
    const versionId = await changedOnOldCode(
      'email',
      { status: 'rejected', rejectionReason: 'No.', rejectionEmailStatus: 'failed' },
      { rejectionEmailStatus: 'superseded', rejectionEmailError: null },
    )

    await reconcileSubmissions(db)

    expect((await reviewColumns(versionId)).submission).toMatchObject({
      status: 'rejected',
      rejectionEmailStatus: 'superseded',
    })
  })

  it('leaves a submission decided differently alone, and reports it as a conflict', async () => {
    const versionId = await changedOnOldCode(
      'conflict',
      { status: 'rejected' },
      {
        status: 'approved',
      },
    )

    const drift = await reconcileSubmissions(db)

    expect(drift).toEqual([
      expect.objectContaining({
        versionId,
        change: 'conflict',
        submissionStatus: 'rejected',
        oldStatus: 'approved',
      }),
    ])
    expect((await reviewColumns(versionId)).submission?.status).toBe('rejected')
  })

  it('never undoes a decision the old columns are missing', async () => {
    const versionId = await changedOnOldCode('ahead', { status: 'approved' }, { status: 'pending' })

    expect(await reconcileSubmissions(db)).toEqual([
      expect.objectContaining({ versionId, change: 'conflict' }),
    ])
    expect((await reviewColumns(versionId)).submission?.status).toBe('approved')
  })

  it('never moves email state back to one the old code could send again from', async () => {
    const versionId = await versionOnOldCode('email-ahead')
    await insertSubmission(db, versionId, AUTHOR, {
      status: 'approved',
      approvalEmailStatus: 'failed',
    })
    // The submission alone moved on, which only a build of #83 without the dual write can do.
    await db
      .update(schema.submissions)
      .set({ approvalEmailStatus: 'sent', approvalEmailId: 'email_2' })
      .where(eq(schema.submissions.id, versionId))

    expect(await reconcileSubmissions(db)).toEqual([
      expect.objectContaining({ versionId, change: 'conflict' }),
    ])
    expect((await reviewColumns(versionId)).submission).toMatchObject({
      approvalEmailStatus: 'sent',
      approvalEmailId: 'email_2',
    })
  })

  it('finds nothing to do on a second run', async () => {
    await versionOnOldCode('rerun-missing')
    await changedOnOldCode('rerun-decided', {}, approvedAndEmailed)

    expect(await reconcileSubmissions(db)).toHaveLength(2)
    expect(await reconcileSubmissions(db)).toEqual([])
  })
})

describe('findReviewDrift', () => {
  it('reports what reconcileSubmissions would copy, and changes nothing', async () => {
    const missing = await versionOnOldCode('dry-missing')
    const decided = await changedOnOldCode('dry-decided', {}, approvedAndEmailed)
    const inSync = await versionOnOldCode('dry-in-sync')
    await insertSubmission(db, inSync, AUTHOR)

    const drift = await findReviewDrift(db)

    expect(drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          versionId: missing,
          slug: 'dry-missing',
          versionNumber: 1,
          change: 'missing',
          submissionStatus: null,
          oldStatus: 'pending',
        }),
        expect.objectContaining({
          versionId: decided,
          change: 'stale',
          submissionStatus: 'pending',
          oldStatus: 'approved',
          columns: expect.arrayContaining(['status', 'reviewedBy', 'approvalEmailStatus']),
        }),
      ]),
    )
    expect(drift).toHaveLength(2)
    expect((await reviewColumns(missing)).row).toBeUndefined()
    expect((await reviewColumns(decided)).submission?.status).toBe('pending')
  })
})
