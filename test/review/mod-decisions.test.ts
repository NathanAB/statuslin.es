import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { getMarketplaceRows } from '@/mods/queries'
import {
  approveAndEmailVersion,
  approveVersion,
  findReviewedItem,
  rejectAndEmailVersion,
} from '@/review/decide'
import { insertPendingSubmission } from '@/submissions/record'
import {
  addMod,
  addVersion,
  fakeGitHub,
  modState,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({
    id: 'submitter',
    name: 'Ada',
    email: 'ada@test.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

const sentEmail = () => vi.fn().mockResolvedValue({ id: 'email_1' })

/** A submitted draft mod: its first version, pending review, rendered unless told not to. */
async function submitMod(slug = 'meter', rendered = true) {
  const modId = await addMod(db, slug, 'draft')
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1, rendered })
  await setCurrentVersion(db, modId, versionId)
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'submitter' })
  return { modId, versionId }
}

/** A newer version of a published mod, submitted as an update and rendered. */
async function submitUpdate(modId: string) {
  const versionId = await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'submitter' })
  return versionId
}

async function submissionOf(versionId: string) {
  const [row] = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, versionId))
  return row
}

describe('approving a mod', () => {
  it('publishes a rendered draft, lists it in the marketplace and emails the submitter', async () => {
    const { versionId } = await submitMod()
    const send = sentEmail()

    await expect(
      approveAndEmailVersion(db, versionId, 'admin', send, fakeGitHub()),
    ).resolves.toEqual({ delivery: 'sent' })

    expect(await modState(db, 'meter')).toEqual({
      status: 'published',
      currentVersionId: versionId,
    })
    expect(await submissionOf(versionId)).toMatchObject({ status: 'approved', reviewedBy: 'admin' })
    expect((await getMarketplaceRows(db)).map((row) => row.slug)).toEqual(['meter'])
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId,
        authorEmail: 'ada@test.com',
        noun: 'mod',
        title: 'meter',
        pagePath: '/mods/meter',
        kind: 'submission',
      }),
    )
  })

  it('moves a published mod to an approved update and says the update is live', async () => {
    const { modId, versionId: first } = await submitMod()
    await approveVersion(db, first, 'admin', fakeGitHub())
    const update = await submitUpdate(modId)
    const send = sentEmail()

    await approveAndEmailVersion(db, update, 'admin', send, fakeGitHub())

    expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: update })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update' }))
  })

  it.each([
    [
      'not rendered',
      () => submitMod('meter', false),
      fakeGitHub(),
      /not rendered on both surfaces/,
    ],
    [
      'off the default branch',
      () => submitMod(),
      fakeGitHub({ onDefaultBranch: false }),
      /not on the repository's default branch/,
    ],
  ])('refuses a version %s and changes nothing', async (_name, seed, github, message) => {
    const { versionId } = await seed()

    await expect(approveVersion(db, versionId, 'admin', github)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(message),
    })
    expect(await modState(db, 'meter')).toMatchObject({ status: 'draft' })
    expect(await submissionOf(versionId)).toMatchObject({ status: 'pending' })
  })

  it('refuses a delisted mod', async () => {
    const { modId, versionId } = await submitMod()
    await db.update(schema.mods).set({ status: 'removed' }).where(eq(schema.mods.id, modId))

    await expect(approveVersion(db, versionId, 'admin', fakeGitHub())).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/delisted/),
    })
  })

  it('refuses when the mod changed while GitHub was being asked, and publishes nothing', async () => {
    const { modId, versionId } = await submitMod()
    const github = fakeGitHub({
      meanwhile: async () => {
        await db.update(schema.mods).set({ status: 'published' }).where(eq(schema.mods.id, modId))
      },
    })

    await expect(approveVersion(db, versionId, 'admin', github)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/published or re-pinned/),
    })
    expect(await submissionOf(versionId)).toMatchObject({ status: 'pending' })
  })

  it('refuses a version that is no longer pending and leaves the live version live', async () => {
    const { modId, versionId: first } = await submitMod()
    await approveVersion(db, first, 'admin', fakeGitHub())
    const update = await submitUpdate(modId)
    await db
      .update(schema.submissions)
      .set({ status: 'superseded' })
      .where(eq(schema.submissions.id, update))

    await expect(approveVersion(db, update, 'admin', fakeGitHub())).rejects.toMatchObject({
      status: 409,
    })
    expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: first })
  })
})

describe('rejecting a mod', () => {
  it('rejects a submission and emails a link to fix and resubmit it', async () => {
    const { versionId } = await submitMod()
    const send = sentEmail()

    await expect(
      rejectAndEmailVersion(db, versionId, 'admin', 'Draws over the prompt', send),
    ).resolves.toEqual({ delivery: 'sent' })

    expect(await submissionOf(versionId)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Draws over the prompt',
      rejectionEmailStatus: 'sent',
    })
    expect(await modState(db, 'meter')).toMatchObject({ status: 'draft' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        noun: 'mod',
        title: 'meter',
        kind: 'submission',
        nextStepPath: '/submit?kind=mod&resubmit=meter',
      }),
    )
  })

  it('keeps a published mod live when its update is rejected', async () => {
    const { modId, versionId: first } = await submitMod()
    await approveVersion(db, first, 'admin', fakeGitHub())
    const update = await submitUpdate(modId)
    const send = sentEmail()

    await rejectAndEmailVersion(db, update, 'admin', 'Breaks the pane', send)

    expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: first })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'update', nextStepPath: '/submit?kind=mod&update=meter' }),
    )
  })
})

describe('findReviewedItem', () => {
  it('names the mod a mod version belongs to', async () => {
    const { modId, versionId } = await submitMod()

    expect(await findReviewedItem(db, versionId)).toEqual({ kind: 'mod', modId, slug: 'meter' })
  })
})
