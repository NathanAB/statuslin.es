import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { themesCard } from '@/og/card'
import { toElementPng } from '@/og/render'
import { homeCardResponse, themesCardResponse } from '@/og/routes'
import type { AnsiSegment } from '@/render/types'
import {
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

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

/** A recorded screen that names its theme, so a card shows which theme it drew. */
const screenOf = (name: string): AnsiSegment[] => [
  { text: `❯ ${name}`, fg: 'rgb(119, 136, 153)', bg: 'rgb(55, 55, 55)' },
]

/** A published plugin of themes alone, each theme recorded as `screenOf` its name. */
async function plugin(
  slug: string,
  themes: Array<{ name: string; window: 'light' | 'dark' }>,
  copyCount = 0,
) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1 })
  await setCurrentVersion(db, modId, versionId)
  await db.update(schema.mods).set({ copyCount }).where(eq(schema.mods.id, modId))
  for (const theme of themes) {
    const themeId = await addTheme(db, versionId, { key: theme.name.toLowerCase(), ...theme })
    await db
      .update(schema.modThemePreviews)
      .set({ segments: screenOf(theme.name) })
      .where(eq(schema.modThemePreviews.themeId, themeId))
  }
}

async function bytes(res: Response) {
  return Buffer.from(await res.arrayBuffer())
}

describe('themesCardResponse', { timeout: 20_000 }, () => {
  it('draws the top theme beside the top theme made for the other window, under the live count', async () => {
    await plugin('quiet', [{ name: 'Paper', window: 'light' }])
    await plugin(
      'popular',
      [
        { name: 'Night', window: 'dark' },
        { name: 'Dawn', window: 'dark' },
      ],
      9,
    )

    const res = await themesCardResponse(db)
    const expected = await toElementPng(
      themesCard({
        count: 3,
        screens: [
          { segments: screenOf('Dawn'), window: 'dark' },
          { segments: screenOf('Paper'), window: 'light' },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect((await bytes(res)).equals(Buffer.from(expected))).toBe(true)
  })

  it('draws the top two when every theme is made for one window', async () => {
    await plugin('popular', [
      { name: 'Night', window: 'dark' },
      { name: 'Dawn', window: 'dark' },
      { name: 'Ash', window: 'dark' },
    ])

    const expected = await toElementPng(
      themesCard({
        count: 3,
        screens: [
          { segments: screenOf('Ash'), window: 'dark' },
          { segments: screenOf('Dawn'), window: 'dark' },
        ],
      }),
    )

    expect((await bytes(await themesCardResponse(db))).equals(Buffer.from(expected))).toBe(true)
  })

  // As for an unknown status line's card: a shared link never breaks, and the hour's cache lets
  // the real card replace it once a theme is published.
  it('serves the home card, on the same hour cache, while no theme is published', async () => {
    const res = await themesCardResponse(db)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect((await bytes(res)).equals(await bytes(await homeCardResponse()))).toBe(true)
  })
})
