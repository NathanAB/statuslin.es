import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { approveVersion, rejectVersion } from '@/review/decide'
import { getModReviewRows } from '@/review/mod-queue'
import { insertPendingSubmission } from '@/submissions/record'
import {
  addDesktopPreview,
  addMod,
  addVersion,
  fakeGitHub,
  openTestDb,
  SEEDED_PREVIEW,
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
    username: 'ada',
    email: 'ada@test.com',
    emailVerified: false,
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

async function submitMod(slug: string, rendered = true) {
  const modId = await addMod(db, slug, 'draft')
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1, rendered })
  await setCurrentVersion(db, modId, versionId)
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'submitter' })
  return { modId, versionId }
}

describe('getModReviewRows', () => {
  it('lists a pending mod with its submitter, source and both previews', async () => {
    const { versionId } = await submitMod('meter')
    await addDesktopPreview(db, versionId, 'shot')

    const [row] = await getModReviewRows(db)

    expect(row).toMatchObject({
      mod: { slug: 'meter', pluginName: 'meter', status: 'draft', authorGithub: 'octocat' },
      version: {
        id: versionId,
        status: 'pending',
        repoUrl: 'https://github.com/octocat/meter',
        commitSha: sha('a'),
      },
      submitter: { name: 'Ada', username: 'ada' },
      rendered: true,
      preview: SEEDED_PREVIEW.segments,
      desktop: {
        kind: 'shot',
        src: `/admin/mod-previews/${versionId}/desktop.png`,
        width: 790,
        height: 52,
      },
    })
    expect(row).not.toHaveProperty('live')
  })

  it('shows an unrendered mod as not rendered, with no previews', async () => {
    await submitMod('meter', false)

    const [row] = await getModReviewRows(db)

    expect(row).toMatchObject({ rendered: false, preview: null, desktop: null })
  })

  it('puts the live version next to a pending update', async () => {
    const { modId, versionId: first } = await submitMod('meter')
    await approveVersion(db, first, 'admin', fakeGitHub())
    const update = await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
    await insertPendingSubmission(db, { kind: 'mod', versionId: update, submittedBy: 'submitter' })

    const rows = await getModReviewRows(db)

    expect(rows.map((r) => r.version.id)).toEqual([update, first])
    expect(rows[0]?.live).toMatchObject({ id: first, commitSha: sha('a') })
  })

  it('keeps a decided mod listed until its email is delivered', async () => {
    const { versionId } = await submitMod('meter')
    await rejectVersion(db, versionId, 'admin', 'No')

    expect((await getModReviewRows(db)).map((r) => r.version.status)).toEqual(['rejected'])

    await db
      .update(schema.submissions)
      .set({ rejectionEmailStatus: 'sent' })
      .where(eq(schema.submissions.id, versionId))
    expect(await getModReviewRows(db)).toEqual([])
  })

  it('lists no curated mod, which has no submission', async () => {
    const modId = await addMod(db, 'curated', 'draft')
    await addVersion(db, modId, { commitSha: sha('c'), versionNumber: 1 })

    expect(await getModReviewRows(db)).toEqual([])
  })
})
