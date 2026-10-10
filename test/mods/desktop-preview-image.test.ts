import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { modDesktopPreviewResponse } from '@/mods/desktop-preview-image'
import {
  addDesktopPreview,
  addVersion,
  openTestDb,
  SEEDED_DESKTOP_SHOT,
  seedMod,
  sha,
  type TestDb,
} from './seed-mods'

let db: TestDb
let close: () => Promise<void>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const live = await seedMod(db, 'live', 'published', 'a')
  await addDesktopPreview(db, live.versionId)
  ids.live = live.versionId
  const older = await addVersion(db, live.modId, { commitSha: sha('b'), versionNumber: 0 })
  await addDesktopPreview(db, older)
  ids.older = older
  for (const [name, status, char] of [
    ['draft', 'draft', 'c'],
    ['removed', 'removed', 'd'],
  ] as const) {
    const mod = await seedMod(db, name, status, char)
    await addDesktopPreview(db, mod.versionId)
    ids[name] = mod.versionId
  }
  const blank = await seedMod(db, 'blank', 'published', 'e')
  await addDesktopPreview(db, blank.versionId, 'nothing')
  ids.nothing = blank.versionId
  ids.unrendered = (await seedMod(db, 'unrendered', 'published', 'f', false)).versionId
})
afterAll(async () => {
  await close()
})

describe('modDesktopPreviewResponse', () => {
  it("serves a published mod's current Desktop shot as an immutable PNG", async () => {
    const res = await modDesktopPreviewResponse(db, ids.live as string)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(
      Array.from(SEEDED_DESKTOP_SHOT.png),
    )
  })

  it.each([
    ['a draft mod', 'draft'],
    ['a removed mod', 'removed'],
    ['a version that is no longer current', 'older'],
    ['a version that drew nothing in Desktop', 'nothing'],
    ['a version with no Desktop result', 'unrendered'],
  ])('is a 404 for %s', async (_name, key) => {
    const res = await modDesktopPreviewResponse(db, ids[key] as string)

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toBe('image/png')
  })

  it.each([
    ['an unknown id', '00000000-0000-4000-8000-000000000000'],
    ['an id that is not a UUID', 'not-a-uuid'],
  ])('is a 404 for %s', async (_name, versionId) => {
    expect((await modDesktopPreviewResponse(db, versionId)).status).toBe(404)
  })
})
