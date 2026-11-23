import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  getGalleryCatalogueMods,
  getHeroMods,
  getModSource,
  getModsSharingTags,
} from '@/mods/gallery-queries'
import { getMarketplaceRows, getModDetail } from '@/mods/queries'
import {
  addMod,
  addTheme,
  addVersion,
  openTestDb,
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

const HOOKS = { events: ['ui.render{component=AbovePrompt}'], calls: [] }
const CALLS = { events: [], calls: ['$.theme.set'] }
const NOTHING = { events: [], calls: [] }
const MODULE = ['./register.ts']

/**
 * A published plugin with this footprint and these hooks modules, carrying `themes` themes on its
 * current version.
 */
async function plugin(
  slug: string,
  footprint: schema.ModFootprint,
  themes: number,
  hooksModules: string[] | null = MODULE,
) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    footprint,
    hooksModules,
    repoUrl: `https://github.com/octocat/${slug}`,
  })
  await setCurrentVersion(db, modId, versionId)
  await db
    .update(schema.mods)
    .set({ allTags: ['ui'] })
    .where(eq(schema.mods.id, modId))
  for (let i = 0; i < themes; i++) await addTheme(db, versionId, { key: `t${i}` })
}

import { eq } from 'drizzle-orm'

// A theme-only plugin draws nothing as a mod, so a mod card for it is an empty preview; its themes
// are listed on /themes instead.
describe('theme-only plugins in the mod lists', () => {
  beforeEach(async () => {
    await plugin('pack', NOTHING, 2, [])
    await plugin('meter', HOOKS, 0)
    await plugin('mixed', HOOKS, 1)
    await plugin('setter', CALLS, 1)
  })

  const listed = ['meter', 'mixed', 'setter']

  it('leaves a theme-only plugin off /mods, the home gallery and /gallery.json', async () => {
    const source = await getModSource(db, { sort: 'top' })
    expect(source.items.map(({ item }) => item.card.slug).sort()).toEqual(listed)
    expect(source.total).toBe(3)
    expect((await getGalleryCatalogueMods(db)).map((mod) => mod.slug).sort()).toEqual(listed)
  })

  it('leaves it out of the hero and the related mods', async () => {
    expect((await getHeroMods(db)).map((mod) => mod.slug).sort()).toEqual(listed)
    const related = await getModsSharingTags(db, { slug: 'meter', tags: ['ui'] }, 10)
    expect(related.map((item) => item.card.slug).sort()).toEqual(['mixed', 'setter'])
  })

  it('keeps it in the marketplace and on its own page', async () => {
    expect((await getMarketplaceRows(db)).map((row) => row.slug)).toContain('pack')
    expect(await getModDetail(db, 'pack')).toMatchObject({ slug: 'pack', themeOnly: true })
    expect(await getModDetail(db, 'mixed')).toMatchObject({ slug: 'mixed', themeOnly: false })
  })

  it('counts a plugin with no themes and no code as a mod, not a theme pack', async () => {
    await plugin('blank', NOTHING, 0, [])
    const source = await getModSource(db, { sort: 'top' })
    expect(source.items.map(({ item }) => item.card.slug)).toContain('blank')
    expect(await getModDetail(db, 'blank')).toMatchObject({ themeOnly: false })
  })

  it('counts a plugin whose hooks module the validator records nothing for as a mod, since it is still code', async () => {
    await plugin('silent', NOTHING, 1, MODULE)
    const source = await getModSource(db, { sort: 'top' })
    expect(source.items.map(({ item }) => item.card.slug)).toContain('silent')
    expect(await getModDetail(db, 'silent')).toMatchObject({ themeOnly: false })
  })

  it('counts a version read before intake recorded its hooks modules as a mod, not a theme pack', async () => {
    await plugin('older', NOTHING, 1, null)
    const source = await getModSource(db, { sort: 'top' })
    expect(source.items.map(({ item }) => item.card.slug)).toContain('older')
    expect(await getModDetail(db, 'older')).toMatchObject({ themeOnly: false })
  })
})
