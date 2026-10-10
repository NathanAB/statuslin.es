import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import type { GalleryItem } from '@/gallery/gallery-items'
import { addPublishedConfig } from '../gallery/seed-configs'
import {
  addMod,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

const testState = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/db', () => ({
  get db() {
    return testState.db
  },
}))
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (handler: () => unknown) => handler,
  createServerFn: () => {
    const wrap = (handler: (args: { data: unknown }) => unknown) => (args?: { data?: unknown }) =>
      handler({ data: args?.data })
    return {
      handler: wrap,
      inputValidator: (validator: (data: never) => unknown) => ({
        handler: (handler: (args: { data: unknown }) => unknown) => (args: { data: never }) =>
          handler({ data: validator(args.data) }),
      }),
    }
  },
}))
vi.mock('@/lib/http.server', () => ({
  withHttpStatus: (run: () => unknown) => run(),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: async () => null,
}))

let db: TestDb
let close: () => Promise<void>
let HomeRoute: typeof import('@/routes/index').Route
let FacetRoute: typeof import('@/routes/status-lines.$facet').Route

async function addPublishedMod(slug: string, allTags: string[]) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    repoUrl: `https://github.com/octocat/${slug}`,
  })
  await setCurrentVersion(db, modId, versionId)
  await db.update(schema.mods).set({ allTags }).where(eq(schema.mods.id, modId))
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  testState.db = db
  await addPublishedConfig(db, 'git-line', { allTags: ['git'] })
  await addPublishedConfig(db, 'plain-line')
  await addPublishedMod('git-mod', ['git'])
  await addPublishedMod('powerline-mod', ['powerline'])
  await addPublishedMod('untagged-mod', [])
  HomeRoute = (await import('@/routes/index')).Route
  FacetRoute = (await import('@/routes/status-lines.$facet')).Route
})
afterAll(async () => {
  await close()
})

const listed = (items: GalleryItem[]) =>
  items.map((item) => `${item.kind}:${item.card.slug}`).sort()

async function loadHome(search: { kind?: 'status-lines' | 'mods'; tags?: string }) {
  const loader = HomeRoute.options.loader as (ctx: unknown) => Promise<{
    gallery: { items: GalleryItem[]; availableTags: string[] }
  }>
  return (await loader({ deps: search })).gallery
}

async function loadFacet(facet: string) {
  const loader = FacetRoute.options.loader as (ctx: unknown) => Promise<{
    items: GalleryItem[]
  }>
  return loader({ params: { facet } })
}

describe('home gallery loader', () => {
  it('lists only status lines under the Status lines filter', async () => {
    expect(listed((await loadHome({ kind: 'status-lines' })).items)).toEqual([
      'status-line:git-line',
      'status-line:plain-line',
    ])
  })

  it('lists only mods under the Mods filter', async () => {
    expect(listed((await loadHome({ kind: 'mods' })).items)).toEqual([
      'mod:git-mod',
      'mod:powerline-mod',
      'mod:untagged-mod',
    ])
  })

  it('lists both kinds under All', async () => {
    expect((await loadHome({})).items).toHaveLength(5)
  })

  it('offers a tag that only a mod carries', async () => {
    expect((await loadHome({})).availableTags).toEqual(expect.arrayContaining(['git', 'powerline']))
  })
})

describe('getGallery input', () => {
  it('ignores malformed mod tag lists instead of failing the page', async () => {
    const { getGallery } = await import('@/gallery/functions')
    const gallery = await getGallery({
      data: { modTags: [['powerline', 3], 42] },
    } as never)

    expect(gallery.availableTags).toContain('powerline')
    expect(gallery.availableTags).not.toContain('cost')
  })
})

describe('facet page loader', () => {
  it('shows a mod only when it carries the tag', async () => {
    expect(listed((await loadFacet('git')).items)).toEqual(['mod:git-mod', 'status-line:git-line'])
  })

  it('serves a facet whose only matches are mods', async () => {
    expect(listed((await loadFacet('powerline')).items)).toEqual(['mod:powerline-mod'])
  })
})
