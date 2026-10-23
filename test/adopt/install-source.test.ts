import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findInstallSource } from '@/adopt/install-source'
import { configs } from '@/db/schema'
import { addPublishedConfig } from '../gallery/seed-configs'
import { openTestDb, type TestDb } from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>
let published: string
let publishedVersion: string
let drafted: string
const OTHER_VERSION = '00000000-0000-4000-8000-000000000001'

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  published = await addPublishedConfig(db, 'meter', { source: 'echo meter', interpreter: 'node' })
  drafted = await addPublishedConfig(db, 'hidden', { status: 'draft' })
  const [row] = await db
    .select({ versionId: configs.currentVersionId })
    .from(configs)
    .where(eq(configs.id, published))
  publishedVersion = row?.versionId ?? ''
})
afterAll(async () => {
  await close()
})

// The home hero fetches a script only when it's about to install it, so the page doesn't carry
// eight scripts it may never copy.
describe('findInstallSource', () => {
  it("returns a published status line's live script, interpreter and title", async () => {
    expect(await findInstallSource(db, published, publishedVersion)).toEqual({
      title: 'meter',
      source: 'echo meter',
      interpreter: 'node',
    })
  })

  it('returns nothing for one that is not published, a missing id or a malformed one', async () => {
    expect(await findInstallSource(db, drafted, publishedVersion)).toBeNull()
    expect(
      await findInstallSource(db, '00000000-0000-4000-8000-000000000000', publishedVersion),
    ).toBeNull()
    expect(await findInstallSource(db, 'not-a-uuid', publishedVersion)).toBeNull()
    expect(await findInstallSource(db, published, 'not-a-uuid')).toBeNull()
  })

  // The hero shows what a version can reach; an update approved since the page loaded may reach
  // more, so it must not be the one copied under the old version's description.
  it('returns nothing when the version shown is no longer the live one', async () => {
    expect(await findInstallSource(db, published, OTHER_VERSION)).toBeNull()
  })
})
