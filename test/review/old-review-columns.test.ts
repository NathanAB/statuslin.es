import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { approveAndEmailVersion, rejectAndEmailVersion, setReadsClaudeToken } from '@/review/decide'
import { REVIEW_STATE_COLUMNS } from '@/submissions/review-state'
import { submitConfig } from '@/submit/submit'

// Until the release that drops them, every review write also lands on config_versions' old review
// columns, so a pre-#83 image still reads the truth after a rollback, and a decision a machine on the
// old code made during the deploy can't be overridden from the new code.

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'old-columns-author',
    name: 'Author',
    email: 'old-columns@test.com',
    emailVerified: true,
  })
})
afterAll(async () => {
  await client.close()
})
beforeEach(async () => {
  await db.delete(schema.configs)
})

async function renderedSubmission(): Promise<{ configId: string; versionId: string }> {
  const submitted = await submitConfig(db, {
    authorId: 'old-columns-author',
    title: 'T',
    description: '',
    interpreter: 'bash',
    source: 'x',
  })
  await db
    .update(schema.renderJobs)
    .set({ status: 'done' })
    .where(eq(schema.renderJobs.configVersionId, submitted.versionId))
  return submitted
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
  const pick = (row: Record<string, unknown>) =>
    Object.fromEntries(REVIEW_STATE_COLUMNS.map((column) => [column, row[column]]))
  return { submission: pick(submission!), version: pick(version!) }
}

/** What the pre-#83 code writes for a decision: config_versions only. */
async function decideOnOldCode(versionId: string, status: 'approved' | 'rejected') {
  await db
    .update(schema.configVersions)
    .set({ status, reviewedBy: 'old-admin', reviewedAt: new Date() })
    .where(eq(schema.configVersions.id, versionId))
}

describe('the old config_versions review columns', () => {
  it('match the submission after an approval and its email', async () => {
    const { versionId } = await renderedSubmission()
    await setReadsClaudeToken(db, versionId, false, 'admin1')

    await approveAndEmailVersion(db, versionId, 'admin1', vi.fn().mockResolvedValue({ id: 'e1' }))

    const { submission, version } = await reviewColumns(versionId)
    expect(submission).toMatchObject({ status: 'approved', approvalEmailStatus: 'sent' })
    expect(version).toEqual(submission)
  })

  it('match the submission after a rejection and its email', async () => {
    const { versionId } = await renderedSubmission()

    await rejectAndEmailVersion(
      db,
      versionId,
      'admin1',
      'No.',
      vi.fn().mockResolvedValue({ id: 'e2' }),
    )

    const { submission, version } = await reviewColumns(versionId)
    expect(submission).toMatchObject({ status: 'rejected', rejectionEmailStatus: 'sent' })
    expect(version).toEqual(submission)
  })
})

describe('a version a machine on the old code decided during the deploy', () => {
  it('cannot be rejected, so its author gets no rejection email', async () => {
    const { versionId } = await renderedSubmission()
    await decideOnOldCode(versionId, 'approved')
    const send = vi.fn().mockResolvedValue({ id: 'e3' })

    await expect(rejectAndEmailVersion(db, versionId, 'admin1', 'No.', send)).rejects.toMatchObject(
      { status: 409 },
    )

    expect(send).not.toHaveBeenCalled()
    expect((await reviewColumns(versionId)).submission.status).toBe('pending')
  })

  it('cannot have its auth-token flag changed', async () => {
    const { versionId } = await renderedSubmission()
    await decideOnOldCode(versionId, 'approved')

    await expect(setReadsClaudeToken(db, versionId, true, 'admin1')).rejects.toMatchObject({
      status: 409,
    })

    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({ readsClaudeToken: false, reviewedBy: 'old-admin' })
  })

  it('cannot be approved, so it is not published', async () => {
    const { configId, versionId } = await renderedSubmission()
    await decideOnOldCode(versionId, 'rejected')
    const send = vi.fn().mockResolvedValue({ id: 'e4' })

    await expect(approveAndEmailVersion(db, versionId, 'admin1', send)).rejects.toMatchObject({
      status: 409,
    })

    expect(send).not.toHaveBeenCalled()
    const [config] = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(config).toMatchObject({ status: 'draft', currentVersionId: null })
  })
})
