import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPublishedModListings } from '@/mods/published-listings'
import { addDesktopTheme, addTheme, openTestDb, seedMod, type TestDb } from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const reef = await seedMod(db, 'theme-examples', 'published', 'a')
  await addDesktopTheme(db, reef.versionId, { key: 'night-reef' })
  const unrecorded = await seedMod(db, 'rainy-window', 'published', 'b')
  await addDesktopTheme(db, unrecorded.versionId, { key: 'rainy', rendered: false })
  const dracula = await seedMod(db, 'dracula', 'published', 'c')
  await addTheme(db, dracula.versionId, { key: 'dracula' })
  await seedMod(db, 'token-weather', 'published', 'd')
})
afterAll(async () => {
  await close()
})

describe('getPublishedModListings', () => {
  it('counts a recorded Desktop theme as a theme card, as it does a terminal one', async () => {
    const listings = await getPublishedModListings(db)

    expect(Object.fromEntries(listings.map((l) => [l.slug, l.hasThemeCards]))).toEqual({
      'theme-examples': true,
      'rainy-window': false,
      dracula: true,
      'token-weather': false,
    })
  })
})
