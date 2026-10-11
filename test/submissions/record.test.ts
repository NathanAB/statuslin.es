import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  assertUnderRateLimit,
  insertPendingSubmission,
  SUBMISSION_RATE_LIMIT,
  supersedePending,
  supersedeRejectionEmail,
} from '@/submissions/record'
import { insertSubmission, setReviewState } from '../fixtures/submission'

const AUTHOR = 'record-author'
const OTHER = 'record-other'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values([
    { id: AUTHOR, name: 'Author', email: 'record-author@test.com' },
    { id: OTHER, name: 'Other', email: 'record-other@test.com' },
  ])
})
afterAll(async () => {
  await client.close()
})
beforeEach(async () => {
  await db.delete(schema.configs)
  await db.delete(schema.mods)
})

async function statusLineVersion(authorId = AUTHOR, versionNumber = 1): Promise<string> {
  const [config] = await db
    .insert(schema.configs)
    .values({ slug: `record-${Math.random()}`, authorId })
    .returning()
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config!.id,
      versionNumber,
      title: 'Title',
      source: 'echo hi',
      interpreter: 'bash',
      contentSha256: 'sha',
    })
    .returning()
  return version!.id
}

async function modVersion(): Promise<string> {
  const [mod] = await db
    .insert(schema.mods)
    .values({ slug: 'record-mod', pluginName: 'record-mod', title: 'Mod', authorGithub: 'octocat' })
    .returning()
  const [version] = await db
    .insert(schema.modVersions)
    .values({
      modId: mod!.id,
      versionNumber: 1,
      repoUrl: 'https://github.com/octocat/mods',
      commitSha: 'a'.repeat(40),
      footprint: { events: [], calls: [] },
      validatedWith: '2.1.0',
    })
    .returning()
  return version!.id
}

async function oldStatus(id: string) {
  const [row] = await db
    .select({ status: schema.configVersions.status })
    .from(schema.configVersions)
    .where(eq(schema.configVersions.id, id))
  return row?.status
}

async function submission(id: string) {
  const [row] = await db.select().from(schema.submissions).where(eq(schema.submissions.id, id))
  return row
}

describe('insertPendingSubmission', () => {
  it('opens a pending status line submission keyed by its version', async () => {
    const versionId = await statusLineVersion()
    await insertPendingSubmission(db, { kind: 'status_line', versionId, submittedBy: AUTHOR })
    expect(await submission(versionId)).toMatchObject({
      id: versionId,
      kind: 'status_line',
      configVersionId: versionId,
      modVersionId: null,
      submittedBy: AUTHOR,
      status: 'pending',
    })
  })

  it('opens a pending mod submission keyed by its version', async () => {
    const versionId = await modVersion()
    await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: AUTHOR })
    expect(await submission(versionId)).toMatchObject({
      id: versionId,
      kind: 'mod',
      configVersionId: null,
      modVersionId: versionId,
      status: 'pending',
    })
  })
})

describe('assertUnderRateLimit', () => {
  async function submitted(submittedBy: string, createdAt: Date) {
    const versionId = await statusLineVersion(submittedBy)
    await db.insert(schema.submissions).values({
      id: versionId,
      kind: 'status_line',
      configVersionId: versionId,
      submittedBy,
      createdAt,
    })
  }

  it('refuses the submitter once they reach the limit within the hour', async () => {
    for (let i = 0; i < SUBMISSION_RATE_LIMIT; i++) {
      await submitted(AUTHOR, new Date(Date.now() - 30 * 60 * 1000))
    }
    await expect(assertUnderRateLimit(db, AUTHOR)).rejects.toMatchObject({ status: 429 })
    await expect(assertUnderRateLimit(db, OTHER)).resolves.toBeUndefined()
  })

  it('ignores submissions older than an hour', async () => {
    for (let i = 0; i < SUBMISSION_RATE_LIMIT; i++) {
      await submitted(AUTHOR, new Date(Date.now() - 2 * 60 * 60 * 1000))
    }
    await expect(assertUnderRateLimit(db, AUTHOR)).resolves.toBeUndefined()
  })
})

describe('supersedePending', () => {
  it('supersedes only the pending submissions it is given and returns their ids', async () => {
    const pending = await statusLineVersion(AUTHOR, 1)
    const rejected = await statusLineVersion(AUTHOR, 1)
    const untouched = await statusLineVersion(AUTHOR, 1)
    for (const versionId of [pending, rejected, untouched]) {
      await insertPendingSubmission(db, { kind: 'status_line', versionId, submittedBy: AUTHOR })
    }
    await setReviewState(db, rejected, { status: 'rejected' })

    expect(await supersedePending(db, [pending, rejected])).toEqual([pending])
    expect((await submission(pending))?.status).toBe('superseded')
    expect((await submission(rejected))?.status).toBe('rejected')
    expect((await submission(untouched))?.status).toBe('pending')
    expect(await supersedePending(db, [])).toEqual([])
    expect(await oldStatus(pending)).toBe('superseded')
  })

  it('refuses, superseding nothing, once a machine on the old code approved one of them', async () => {
    const pending = await statusLineVersion(AUTHOR, 1)
    const approvedOnOldCode = await statusLineVersion(AUTHOR, 1)
    for (const versionId of [pending, approvedOnOldCode]) {
      await insertPendingSubmission(db, { kind: 'status_line', versionId, submittedBy: AUTHOR })
    }
    await db
      .update(schema.configVersions)
      .set({ status: 'approved' })
      .where(eq(schema.configVersions.id, approvedOnOldCode))

    await expect(supersedePending(db, [pending, approvedOnOldCode])).rejects.toMatchObject({
      status: 409,
    })
    expect((await submission(pending))?.status).toBe('pending')
    expect(await oldStatus(approvedOnOldCode)).toBe('approved')
  })
})

describe('supersedeRejectionEmail', () => {
  async function rejectedWithEmail(rejectionEmailStatus: string) {
    const versionId = await statusLineVersion()
    await insertSubmission(db, versionId, AUTHOR, {
      status: 'rejected',
      rejectionEmailStatus,
      rejectionEmailError: 'Email delivery failed',
    })
    return { id: versionId, rejectionEmailStatus }
  }

  it('withdraws an unsent rejection email', async () => {
    const rejected = await rejectedWithEmail('failed')
    await supersedeRejectionEmail(db, rejected)
    expect(await submission(rejected.id)).toMatchObject({
      rejectionEmailStatus: 'superseded',
      rejectionEmailError: null,
    })
  })

  it('leaves a sent rejection email alone', async () => {
    const rejected = await rejectedWithEmail('sent')
    await supersedeRejectionEmail(db, rejected)
    expect((await submission(rejected.id))?.rejectionEmailStatus).toBe('sent')
  })

  it('refuses while the rejection email is sending', async () => {
    const rejected = await rejectedWithEmail('sending')
    await expect(supersedeRejectionEmail(db, rejected)).rejects.toMatchObject({ status: 409 })
  })
})
