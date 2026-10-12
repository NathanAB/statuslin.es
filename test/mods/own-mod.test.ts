import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getOwnModDraft } from '@/mods/own-mod'
import { insertPendingSubmission } from '@/submissions/record'
import { addMod, addVersion, openTestDb, setCurrentVersion, sha, type TestDb } from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  for (const id of ['ada', 'bob']) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@test.com` })
  }
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

async function submitted(status: schema.ModStatus, review: schema.SubmissionStatus, path = '') {
  const modId = await addMod(db, 'meter', status)
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1, path })
  await setCurrentVersion(db, modId, versionId)
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'ada' })
  await db
    .update(schema.submissions)
    .set({ status: review })
    .where(eq(schema.submissions.id, versionId))
}

describe('getOwnModDraft', () => {
  it('prefills an update with the plugin folder at the default branch', async () => {
    await submitted('published', 'approved', 'plugins/meter')

    expect(await getOwnModDraft(db, 'meter', 'update', 'ada')).toEqual({
      kind: 'update',
      slug: 'meter',
      title: 'meter',
      link: 'https://github.com/octocat/meter/tree/HEAD/plugins/meter',
    })
  })

  it('prefills a fix to a rejected draft with the repository', async () => {
    await submitted('draft', 'rejected')

    expect(await getOwnModDraft(db, 'meter', 'resubmission', 'ada')).toMatchObject({
      kind: 'resubmission',
      link: 'https://github.com/octocat/meter',
    })
  })

  it.each([
    ['an update to a draft', 'draft', 'pending', 'update', 409],
    ['a fix while still in review', 'draft', 'pending', 'resubmission', 409],
  ] as const)('refuses %s', async (_name, status, review, kind, code) => {
    await submitted(status, review)

    await expect(getOwnModDraft(db, 'meter', kind, 'ada')).rejects.toMatchObject({ status: code })
  })

  it('refuses another user’s mod', async () => {
    await submitted('published', 'approved')

    await expect(getOwnModDraft(db, 'meter', 'update', 'bob')).rejects.toMatchObject({
      status: 404,
    })
  })
})
