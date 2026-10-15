import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { PAGE_SIZE } from '@/gallery/queries'
import { FEATURED_MOD_SLUG } from '@/mods/featured-mod'
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

async function addPublishedMod(slug: string) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    repoUrl: `https://github.com/octocat/${slug}`,
  })
  await setCurrentVersion(db, modId, versionId)
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  testState.db = db
  await addPublishedMod(FEATURED_MOD_SLUG)
  await addPublishedMod('other-mod')
  // Enough status lines for a second gallery page.
  for (let i = 0; i < PAGE_SIZE; i++) await addPublishedConfig(db, `line-${i}`)
  HomeRoute = (await import('@/routes/index')).Route
})
afterAll(async () => {
  await close()
})

async function loadFeaturedMod(
  search: { page?: number; sort?: 'new'; tags?: string; kind?: 'mods' | 'status-lines' } = {},
): Promise<string | null> {
  return (await loadHome(search)).featuredMod?.slug ?? null
}

type HomeSearch = { page?: number; sort?: 'new'; tags?: string; kind?: 'mods' | 'status-lines' }

function loadHome(search: HomeSearch) {
  const loader = HomeRoute.options.loader as (ctx: unknown) => Promise<{
    featuredMod: GalleryModCard | null
    gallery: { items: Array<{ kind: string; card: { slug: string } }> }
  }>
  return loader({ deps: search })
}

describe('home "Featured mod" row loader', () => {
  it('features the chosen mod on the default first page', async () => {
    expect(await loadFeaturedMod()).toBe(FEATURED_MOD_SLUG)
  })

  // Switching sort, tags or kind keeps the row in place, so the filter buttons below it don't jump.
  it('features the same mod on every sort, tag and kind of page 1', async () => {
    expect(await loadFeaturedMod({ sort: 'new' })).toBe(FEATURED_MOD_SLUG)
    expect(await loadFeaturedMod({ tags: 'git' })).toBe(FEATURED_MOD_SLUG)
    expect(await loadFeaturedMod({ kind: 'mods' })).toBe(FEATURED_MOD_SLUG)
    expect(await loadFeaturedMod({ kind: 'status-lines' })).toBe(FEATURED_MOD_SLUG)
  })

  it('never lists the featured mod in the grid, so it shows once', async () => {
    for (const search of [{}, { kind: 'mods' as const }, { sort: 'new' as const }, { page: 2 }]) {
      const { gallery } = await loadHome(search)
      expect(gallery.items.map((item) => item.card.slug)).not.toContain(FEATURED_MOD_SLUG)
    }
    const { gallery } = await loadHome({ kind: 'mods' })
    expect(gallery.items.map((item) => item.card.slug)).toEqual(['other-mod'])
  })

  it('features none past page 1', async () => {
    expect(await loadFeaturedMod({ page: 2 })).toBeNull()
  })
})
