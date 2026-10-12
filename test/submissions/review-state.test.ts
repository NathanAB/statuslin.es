import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { HttpError } from '@/lib/http'
import { insertPendingSubmission } from '@/submissions/record'
import { updateReviewState } from '@/submissions/review-state'
import { insertSubmission } from '../fixtures/submission'

const AUTHOR = 'review-state-author'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({ id: AUTHOR, name: 'Author', email: 'rs@test.com' })
})
afterAll(async () => {
  await client.close()
})
beforeEach(async () => {
  await db.delete(schema.configs)
})

async function pendingVersion(): Promise<string> {
  const [config] = await db
    .insert(schema.configs)
    .values({ slug: `review-state-${Math.random()}`, authorId: AUTHOR })
    .returning()
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config!.id,
      versionNumber: 1,
      title: 'Title',
      source: 'echo hi',
      interpreter: 'bash',
      contentSha256: 'sha',
    })
    .returning()
  await insertSubmission(db, version!.id, AUTHOR)
  return version!.id
}

async function reviewState(versionId: string) {
  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, versionId))
  const [version] = await db
    .select()
    .from(schema.configVersions)
    .where(eq(schema.configVersions.id, versionId))
  return { submission: submission!, version: version! }
}

const reject = (versionId: string) =>
  updateReviewState(db, { status: 'rejected', rejectionReason: 'no' }, (t) =>
    and(eq(t.id, versionId), eq(t.status, 'pending')),
  )

describe('updateReviewState', () => {
  it('writes the review state to the submission and to the old config_versions columns', async () => {
    const versionId = await pendingVersion()

    expect(await reject(versionId)).toEqual([versionId])

    const { submission, version } = await reviewState(versionId)
    expect(submission).toMatchObject({ status: 'rejected', rejectionReason: 'no' })
    expect(version).toMatchObject({ status: 'rejected', rejectionReason: 'no' })
  })

  it('returns no ids, and changes nothing, when neither table matches', async () => {
    const versionId = await pendingVersion()
    await reject(versionId)

    expect(await reject(versionId)).toEqual([])
  })

  it('refuses, changing neither table, when a machine on the old code changed the version', async () => {
    const versionId = await pendingVersion()
    // The pre-#83 code approves by writing only config_versions.
    await db
      .update(schema.configVersions)
      .set({ status: 'approved' })
      .where(eq(schema.configVersions.id, versionId))

    const refused = await reject(versionId).catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(HttpError)
    expect((refused as HttpError).status).toBe(409)
    const { submission, version } = await reviewState(versionId)
    expect(submission.status).toBe('pending')
    expect(version.status).toBe('approved')
  })

  it('refuses a write with no where clause rather than update every version', async () => {
    const versionId = await pendingVersion()

    await expect(updateReviewState(db, { status: 'rejected' }, () => undefined)).rejects.toThrow()
    expect((await reviewState(versionId)).submission.status).toBe('pending')
  })

  it('refuses a version written by the old code, which has no submission yet', async () => {
    const versionId = await pendingVersion()
    await db.delete(schema.submissions).where(eq(schema.submissions.id, versionId))

    await expect(reject(versionId)).rejects.toMatchObject({ status: 409 })
    expect((await reviewState(versionId)).version.status).toBe('pending')
  })

  it('writes a mod submission alone, since mods never had the old columns', async () => {
    const [mod] = await db
      .insert(schema.mods)
      .values({ slug: 'meter', pluginName: 'meter', title: 'Meter', authorGithub: 'octocat' })
      .returning()
    const [version] = await db
      .insert(schema.modVersions)
      .values({
        modId: mod!.id,
        versionNumber: 1,
        repoUrl: 'https://github.com/octocat/meter',
        commitSha: 'a'.repeat(40),
        footprint: { events: [], calls: [] },
        validatedWith: '2.1.0',
      })
      .returning()
    await insertPendingSubmission(db, { kind: 'mod', versionId: version!.id, submittedBy: AUTHOR })

    expect(await reject(version!.id)).toEqual([version!.id])
    const [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, version!.id))
    expect(submission).toMatchObject({ status: 'rejected', rejectionReason: 'no' })
    await db.delete(schema.mods)
  })
})
