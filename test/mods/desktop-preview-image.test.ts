import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
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

/** The `r` the page puts in a version's image URL: when its Desktop result was stored. */
async function renderOf(versionId: string): Promise<string> {
  const [row] = await db
    .select({ createdAt: schema.modDesktopPreviews.createdAt })
    .from(schema.modDesktopPreviews)
    .where(eq(schema.modDesktopPreviews.modVersionId, versionId))
  return String(row?.createdAt.getTime() ?? 0)
}

describe('modDesktopPreviewResponse', () => {
  it("serves a published mod's current Desktop shot as a PNG cached for an hour", async () => {
    const live = ids.live as string
    const res = await modDesktopPreviewResponse(db, live, await renderOf(live), null)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    // Short enough that a delisted mod's image leaves shared caches soon after its page does.
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(
      Array.from(SEEDED_DESKTOP_SHOT.png),
    )
  })

  it("serves the shot's card image under the same render, cached the same way", async () => {
    const live = ids.live as string
    const res = await modDesktopPreviewResponse(db, live, await renderOf(live), 'card')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(
      Array.from(SEEDED_DESKTOP_SHOT.cardPng),
    )
  })

  it.each([
    ['a draft mod', 'draft'],
    ['a removed mod', 'removed'],
    ['a version that is no longer current', 'older'],
    ['a version that drew nothing in Desktop', 'nothing'],
    ['a version with no Desktop result', 'unrendered'],
  ])('is a 404 for %s, shot or card', async (_name, key) => {
    const versionId = ids[key] as string
    for (const image of [null, 'card']) {
      const res = await modDesktopPreviewResponse(db, versionId, await renderOf(versionId), image)

      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).not.toBe('image/png')
    }
  })

  it('is a 404 for an image it does not have', async () => {
    const live = ids.live as string

    expect((await modDesktopPreviewResponse(db, live, await renderOf(live), 'pane')).status).toBe(
      404,
    )
  })

  it.each([
    ['an unknown id', '00000000-0000-4000-8000-000000000000'],
    ['an id that is not a UUID', 'not-a-uuid'],
  ])('is a 404 for %s', async (_name, versionId) => {
    expect((await modDesktopPreviewResponse(db, versionId, '0', null)).status).toBe(404)
  })

  it.each([
    ['no render', null],
    ['another render', '1'],
    ['a render that is not a number', 'abc'],
  ])(
    'is a 404 for the current shot named with %s, so made-up URLs miss every cache',
    async (_name, render) => {
      for (const image of [null, 'card']) {
        expect(
          (await modDesktopPreviewResponse(db, ids.live as string, render, image)).status,
        ).toBe(404)
      }
    },
  )
})
