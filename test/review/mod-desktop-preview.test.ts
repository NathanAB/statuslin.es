import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import {
  addDesktopPreview,
  openTestDb,
  SEEDED_DESKTOP_SHOT,
  seedMod,
  type TestDb,
} from '../mods/seed-mods'

const assertAdmin = vi.hoisted(() => vi.fn())
vi.mock('@/review/admin', () => ({ assertAdmin }))
vi.mock('@/db', () => ({ db: {} }))

const { adminModDesktopPreviewResponse } = await import('@/review/mod-desktop-preview')

let db: TestDb
let close: () => Promise<void>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const draft = await seedMod(db, 'draft', 'draft', 'a')
  await addDesktopPreview(db, draft.versionId)
  ids.draft = draft.versionId
  ids.nothing = (await seedMod(db, 'blank', 'draft', 'b')).versionId
})
beforeEach(() => {
  assertAdmin.mockReset().mockResolvedValue({ id: 'admin' })
})
afterAll(async () => {
  await close()
})

const get = (versionId: string) => adminModDesktopPreviewResponse(db, new Headers(), versionId)

describe('adminModDesktopPreviewResponse', () => {
  it("serves an unpublished version's Desktop shot to an admin, uncached", async () => {
    const res = await get(ids.draft as string)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(SEEDED_DESKTOP_SHOT.png)
  })

  it.each([
    [401, 'sign in required'],
    [403, 'admin only'],
  ])('refuses with %i when the viewer is not an admin', async (status, message) => {
    assertAdmin.mockRejectedValue(new HttpError(status, message))

    const res = await get(ids.draft as string)
    expect(res.status).toBe(status)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each([
    ['a version that drew nothing', () => ids.nothing as string],
    ['an id that is not a uuid', () => 'not-a-uuid'],
    ['an unknown version', () => '00000000-0000-4000-8000-000000000000'],
  ])('answers 404 for %s', async (_name, versionId) => {
    const res = await get(versionId())
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
