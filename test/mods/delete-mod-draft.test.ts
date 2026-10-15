import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { insertPendingSubmission } from '@/submissions/record'
import { runDeleteDraft } from '../../scripts/delete-mod-draft'
import { addMod, addVersion, openTestDb, seedMod, sha, type TestDb } from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({ id: 'ada', name: 'ada', email: 'ada@test.com' })
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

async function deleteDraft(args: string[]) {
  const lines: string[] = []
  const exitCode = await runDeleteDraft(args, { db, log: (line) => lines.push(line) })
  return { exitCode, output: lines.join('\n') }
}

const modCount = async () => (await db.select().from(schema.mods)).length

/** A submitted draft: its first version pending review. */
async function submittedDraft(slug: string) {
  const { modId, versionId } = await seedMod(db, slug, 'draft', 'a')
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'ada' })
  return { modId, versionId }
}

describe('delete-mod-draft', () => {
  it('lists the draft and changes nothing without a confirmation', async () => {
    await submittedDraft('meter-3f9a2c')

    const { exitCode, output } = await deleteDraft(['meter-3f9a2c'])

    expect(exitCode).toBe(0)
    expect(output).toMatch(/v1: pending/)
    expect(output).toMatch(/--confirm=meter-3f9a2c/)
    expect(await modCount()).toBe(1)
  })

  it('refuses a confirmation that does not match', async () => {
    await submittedDraft('meter-3f9a2c')

    const { exitCode } = await deleteDraft(['meter-3f9a2c', '--confirm=meter'])

    expect(exitCode).toBe(1)
    expect(await modCount()).toBe(1)
  })

  it('deletes the draft with its versions and submissions once the slug is typed back', async () => {
    const { modId } = await submittedDraft('meter-3f9a2c')
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })

    const { exitCode } = await deleteDraft(['meter-3f9a2c', '--confirm=meter-3f9a2c'])

    expect(exitCode).toBe(0)
    expect(await modCount()).toBe(0)
    expect(
      await db.select().from(schema.modVersions).where(eq(schema.modVersions.modId, modId)),
    ).toEqual([])
    expect(await db.select().from(schema.submissions)).toEqual([])
  })

  it.each(['published', 'removed'] as const)('refuses a %s mod', async (status) => {
    await addMod(db, 'meter', status)

    const { exitCode, output } = await deleteDraft(['meter', '--confirm=meter'])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/only a draft/)
    expect(await modCount()).toBe(1)
  })

  it('refuses an unknown slug and prints usage without one', async () => {
    expect((await deleteDraft(['nope'])).exitCode).toBe(1)
    expect((await deleteDraft([])).output).toMatch(/Usage/)
  })
})
