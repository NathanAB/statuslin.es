import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { themeDesktopPreviewResponse } from '@/themes/desktop-preview-image'
import { previewQuery } from '../helpers/preview-query'
import {
  addDesktopTheme,
  addTheme,
  addVersion,
  openTestDb,
  SEEDED_THEME_SHOT,
  seedMod,
  sha,
  type TestDb,
} from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const live = await seedMod(db, 'theme-examples', 'published', 'a')
  ids.live = await addDesktopTheme(db, live.versionId, { key: 'night-reef' })
  ids.unrendered = await addDesktopTheme(db, live.versionId, {
    key: 'honu-lagoon',
    rendered: false,
  })
  ids.terminal = await addTheme(db, live.versionId, { key: 'ocean' })
  const older = await addVersion(db, live.modId, { commitSha: sha('b'), versionNumber: 0 })
  ids.older = await addDesktopTheme(db, older, { key: 'night-reef' })
  for (const [slug, status, char] of [
    ['draft-themes', 'draft', 'c'],
    ['removed-themes', 'removed', 'd'],
  ] as const) {
    const mod = await seedMod(db, slug, status, char)
    ids[status] = await addDesktopTheme(db, mod.versionId, { key: 'night-reef' })
  }
})
afterAll(async () => {
  await close()
})

async function renderOf(themeId: string): Promise<string> {
  const [row] = await db
    .select({ createdAt: schema.modThemeDesktopPreviews.createdAt })
    .from(schema.modThemeDesktopPreviews)
    .where(eq(schema.modThemeDesktopPreviews.themeId, themeId))
  return String(row?.createdAt.getTime() ?? 0)
}

describe('themeDesktopPreviewResponse', () => {
  it.each([
    ['whole window', null, SEEDED_THEME_SHOT.png],
    ['card image', 'card', SEEDED_THEME_SHOT.cardPng],
  ])(
    "serves a published plugin's live Desktop theme's %s as a PNG a browser keeps for good and a shared cache for an hour",
    async (_name, image, png) => {
      const live = ids.live as string
      const res = await themeDesktopPreviewResponse(
        db,
        live,
        previewQuery(await renderOf(live), image),
      )

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable, s-maxage=3600',
      )
      expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(png))
    },
  )

  it.each([
    ["a draft plugin's theme", 'draft'],
    ["a removed plugin's theme", 'removed'],
    ['a theme of a version that is no longer live', 'older'],
    ['a theme with no shot yet', 'unrendered'],
    ['a terminal theme', 'terminal'],
  ])('is a 404 for %s, shot or card', async (_name, key) => {
    const themeId = ids[key] as string
    for (const image of [null, 'card']) {
      const res = await themeDesktopPreviewResponse(
        db,
        themeId,
        previewQuery(await renderOf(themeId), image),
      )

      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).not.toBe('image/png')
    }
  })

  it('is a 404 for an image it does not have', async () => {
    const live = ids.live as string

    expect(
      (await themeDesktopPreviewResponse(db, live, previewQuery(await renderOf(live), 'pane')))
        .status,
    ).toBe(404)
  })

  it.each([
    ['an id that is not a UUID', 'not-a-uuid'],
    ['an unknown id', '00000000-0000-4000-8000-000000000000'],
  ])('is a 404 for %s', async (_name, themeId) => {
    expect((await themeDesktopPreviewResponse(db, themeId, previewQuery('0', null))).status).toBe(
      404,
    )
  })

  it.each([
    ['no render', null],
    ['another render', '1'],
  ])(
    'is a 404 for the live shot named with %s, so made-up URLs miss every cache',
    async (_name, render) => {
      for (const image of [null, 'card']) {
        expect(
          (await themeDesktopPreviewResponse(db, ids.live as string, previewQuery(render, image)))
            .status,
        ).toBe(404)
      }
    },
  )

  it.each([
    ['a parameter it does not read', (r: string) => `?r=${r}&v=1`],
    ['its render named twice', (r: string) => `?r=${r}&r=${r}`],
    ['an empty pair after it', (r: string) => `?r=${r}&`],
    ['an empty pair before it', (r: string) => `?&r=${r}`],
    ['its key percent-encoded', (r: string) => `?%72=${r}`],
    [
      'its render percent-encoded',
      (r: string) => `?r=${encodeURIComponent(r).replace(/\d/g, (d) => `%3${d}`)}`,
    ],
    ['its image named twice', (r: string) => `?r=${r}&image=card&image=card`],
    ['its image percent-encoded', (r: string) => `?r=${r}&image=%63ard`],
    ['image before render', (r: string) => `?image=card&r=${r}`],
  ])(
    'is a 404 for the current shot with %s, so no cache-busting variant of its URL serves the image',
    async (_name, query) => {
      const render = await renderOf(ids.live as string)
      const res = await themeDesktopPreviewResponse(db, ids.live as string, query(render))

      expect(res.status).toBe(404)
    },
  )
})
