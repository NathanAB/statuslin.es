import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getMyModRows } from '@/review/my-submissions'
import { insertPendingSubmission } from '@/submissions/record'
import {
  addMod,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

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

async function submitVersion(modId: string, n: number, by = 'ada', status = 'pending') {
  const versionId = await addVersion(db, modId, { commitSha: sha(String(n)), versionNumber: n })
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: by })
  await db
    .update(schema.submissions)
    .set({
      status: status as schema.SubmissionStatus,
      rejectionReason: status === 'rejected' ? 'No' : null,
    })
    .where(eq(schema.submissions.id, versionId))
  return versionId
}

describe('getMyModRows', () => {
  it('lists the user’s mods by their newest version, with the live version number', async () => {
    const meter = await addMod(db, 'meter', 'published')
    const live = await submitVersion(meter, 1, 'ada', 'approved')
    await setCurrentVersion(db, meter, live)
    await submitVersion(meter, 2, 'ada', 'rejected')
    const gauge = await addMod(db, 'gauge', 'draft')
    await setCurrentVersion(db, gauge, await submitVersion(gauge, 3))

    const rows = await getMyModRows(db, 'ada')

    expect(rows).toEqual(
      expect.arrayContaining([
        {
          mod: expect.objectContaining({ slug: 'meter', status: 'published' }),
          latest: { versionNumber: 2, status: 'rejected', rejectionReason: 'No' },
          liveVersionNumber: 1,
        },
        {
          mod: expect.objectContaining({ slug: 'gauge', status: 'draft' }),
          latest: { versionNumber: 3, status: 'pending', rejectionReason: null },
          liveVersionNumber: null,
        },
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  it('lists no mod someone else submitted, and no curated mod', async () => {
    const theirs = await addMod(db, 'theirs', 'draft')
    await submitVersion(theirs, 4, 'bob')
    const curated = await addMod(db, 'curated', 'published')
    await addVersion(db, curated, { commitSha: sha('5'), versionNumber: 1 })

    expect(await getMyModRows(db, 'ada')).toEqual([])
  })
})
