import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import {
  addDesktopTheme,
  addTheme,
  openTestDb,
  SEEDED_THEME_SHOT,
  seedMod,
  type TestDb,
} from '../mods/seed-mods'

const assertAdmin = vi.hoisted(() => vi.fn())
vi.mock('@/review/admin', () => ({ assertAdmin }))
vi.mock('@/db', () => ({ db: {} }))

const { adminThemeDesktopPreviewResponse } = await import('@/review/theme-desktop-preview')

let db: TestDb
let close: () => Promise<void>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const draft = await seedMod(db, 'theme-examples', 'draft', 'a')
  ids.draft = await addDesktopTheme(db, draft.versionId, { key: 'night-reef' })
  ids.unrendered = await addDesktopTheme(db, draft.versionId, {
    key: 'honu-lagoon',
    rendered: false,
  })
  ids.terminal = await addTheme(db, draft.versionId, { key: 'ocean' })
})
beforeEach(() => {
  assertAdmin.mockReset().mockResolvedValue({ id: 'admin' })
})
afterAll(async () => {
  await close()
})

const get = (themeId: string) => adminThemeDesktopPreviewResponse(db, new Headers(), themeId)

describe('adminThemeDesktopPreviewResponse', () => {
  it("serves an unpublished Desktop theme's whole-window shot to an admin, uncached", async () => {
    const res = await get(ids.draft as string)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(SEEDED_THEME_SHOT.png)
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
    ['a theme with no shot yet', () => ids.unrendered as string],
    ['a terminal theme', () => ids.terminal as string],
    ['an id that is not a uuid', () => 'not-a-uuid'],
    ['an unknown theme', () => '00000000-0000-4000-8000-000000000000'],
  ])('answers 404 for %s', async (_name, themeId) => {
    const res = await get(themeId())
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
