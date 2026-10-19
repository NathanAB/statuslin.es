import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findInstallSource } from '@/adopt/install-source'
import { addPublishedConfig } from '../gallery/seed-configs'
import { openTestDb, type TestDb } from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>
let published: string
let drafted: string

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  published = await addPublishedConfig(db, 'meter', { source: 'echo meter', interpreter: 'node' })
  drafted = await addPublishedConfig(db, 'hidden', { status: 'draft' })
})
afterAll(async () => {
  await close()
})

// The home hero fetches a script only when it's about to install it, so the page doesn't carry
// eight scripts it may never copy.
describe('findInstallSource', () => {
  it("returns a published status line's live script, interpreter and title", async () => {
    expect(await findInstallSource(db, published)).toEqual({
      title: 'meter',
      source: 'echo meter',
      interpreter: 'node',
    })
  })

  it('returns nothing for one that is not published, a missing id or a malformed one', async () => {
    expect(await findInstallSource(db, drafted)).toBeNull()
    expect(await findInstallSource(db, '00000000-0000-4000-8000-000000000000')).toBeNull()
    expect(await findInstallSource(db, 'not-a-uuid')).toBeNull()
  })
})
