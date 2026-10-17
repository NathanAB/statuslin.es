import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getModDesktopShot, getModDesktopShotPng } from '@/mods/desktop-shot'
import {
  addDesktopPreview,
  addMod,
  addVersion,
  openTestDb,
  SEEDED_DESKTOP_SHOT,
  seedMod,
  setCurrentVersion,
  sha,
  type TestDb,
} from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
afterAll(async () => {
  await close()
})
beforeEach(async () => {
  await db.delete(schema.mods)
})

describe('getModDesktopShot', () => {
  it("returns a published mod's Desktop shot as an image path and CSS size", async () => {
    const { versionId } = await seedMod(db, 'anywhere', 'published', 'a')
    await addDesktopPreview(db, versionId)

    expect(await getModDesktopShot(db, 'anywhere')).toEqual({
      kind: 'shot',
      shot: {
        src: expect.stringMatching(
          new RegExp(`^/mod-previews/${versionId}/desktop\\.png\\?r=\\d+$`),
        ),
        width: SEEDED_DESKTOP_SHOT.width,
        height: SEEDED_DESKTOP_SHOT.height,
      },
    })
  })

  it('says a published mod has no shot when it drew nothing in Desktop or has no result yet', async () => {
    await seedMod(db, 'blank', 'published', 'a')
    const modId = await addMod(db, 'unrendered', 'published')
    await setCurrentVersion(
      db,
      modId,
      await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 1, rendered: false }),
    )

    expect(await getModDesktopShot(db, 'blank')).toEqual({ kind: 'no-shot' })
    expect(await getModDesktopShot(db, 'unrendered')).toEqual({ kind: 'no-shot' })
  })

  it('says a mod is unpublished when it is a draft, removed, or unknown', async () => {
    for (const [slug, status] of [
      ['draft', 'draft'],
      ['removed', 'removed'],
    ] as const) {
      const { versionId } = await seedMod(db, slug, status, 'a')
      await addDesktopPreview(db, versionId)
      expect(await getModDesktopShot(db, slug)).toEqual({ kind: 'unpublished' })
    }
    expect(await getModDesktopShot(db, 'unknown')).toEqual({ kind: 'unpublished' })
  })
})

describe('getModDesktopShotPng', () => {
  it("returns a published mod's Desktop shot as PNG bytes and CSS size", async () => {
    const { versionId } = await seedMod(db, 'anywhere', 'published', 'a')
    await addDesktopPreview(db, versionId)

    expect(await getModDesktopShotPng(db, 'anywhere')).toEqual({
      png: SEEDED_DESKTOP_SHOT.png,
      width: SEEDED_DESKTOP_SHOT.width,
      height: SEEDED_DESKTOP_SHOT.height,
    })
  })

  it('is null for a mod with no shot or no published page', async () => {
    await seedMod(db, 'blank', 'published', 'a')
    const modId = await addMod(db, 'unrendered', 'published')
    await setCurrentVersion(
      db,
      modId,
      await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 1, rendered: false }),
    )
    const { versionId } = await seedMod(db, 'draft', 'draft', 'c')
    await addDesktopPreview(db, versionId)

    for (const slug of ['blank', 'unrendered', 'draft', 'unknown']) {
      expect(await getModDesktopShotPng(db, slug)).toBeNull()
    }
  })
})
