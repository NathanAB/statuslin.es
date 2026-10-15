import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { PAGE_SIZE } from '@/gallery/queries'
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

async function addModCreatedAt(slug: string, status: schema.ModStatus, createdAt: string) {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    repoUrl: `https://github.com/octocat/${slug}`,
  })
  await setCurrentVersion(db, modId, versionId)
  await db
    .update(schema.mods)
    .set({ createdAt: new Date(createdAt), allTags: ['git'] })
    .where(eq(schema.mods.id, modId))
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  testState.db = db
  await addModCreatedAt('oldest-mod', 'published', '2026-10-01T00:00:00Z')
  await addModCreatedAt('newest-mod', 'published', '2026-10-05T00:00:00Z')
  await addModCreatedAt('middle-mod', 'published', '2026-10-03T00:00:00Z')
  await addModCreatedAt('second-mod', 'published', '2026-10-04T00:00:00Z')
  await addModCreatedAt('fourth-mod', 'published', '2026-10-02T00:00:00Z')
  await addModCreatedAt('unpublished-mod', 'draft', '2026-10-06T00:00:00Z')
  // Enough status lines for a second gallery page.
  for (let i = 0; i < PAGE_SIZE; i++) await addPublishedConfig(db, `line-${i}`)
  HomeRoute = (await import('@/routes/index')).Route
})
afterAll(async () => {
  await close()
})

async function loadNewMods(
  search: { page?: number; sort?: 'new'; tags?: string; kind?: 'mods' } = {},
): Promise<string[]> {
  const loader = HomeRoute.options.loader as (ctx: unknown) => Promise<{
    newMods: GalleryModCard[]
  }>
  return (await loader({ deps: search })).newMods.map((card) => card.slug)
}

async function loadHome() {
  const loader = HomeRoute.options.loader as (ctx: unknown) => Promise<{
    newMods: GalleryModCard[]
    gallery: { items: Array<{ kind: string; card: { slug: string } }> }
  }>
  return loader({ deps: {} })
}

describe('home "New mods" row loader', () => {
  it('lists two mods, newest first, on the default first page', async () => {
    const { newMods, gallery } = await loadHome()
    const inGrid = new Set(
      gallery.items.filter((item) => item.kind === 'mod').map((item) => item.card.slug),
    )
    const newest = ['newest-mod', 'second-mod', 'middle-mod', 'fourth-mod', 'oldest-mod']
    expect(newMods.map((card) => card.slug)).toEqual(
      newest.filter((slug) => !inGrid.has(slug)).slice(0, 2),
    )
  })

  it('never repeats a mod that page 1 of the grid already shows', async () => {
    const { newMods, gallery } = await loadHome()
    const inGrid = gallery.items.filter((item) => item.kind === 'mod').map((item) => item.card.slug)
    expect(newMods.map((card) => card.slug).filter((slug) => inGrid.includes(slug))).toEqual([])
  })

  it('lists none past page 1', async () => {
    expect(await loadNewMods({ page: 2 })).toEqual([])
  })

  it('lists none on a sorted, tagged or kind-filtered view', async () => {
    expect(await loadNewMods({ sort: 'new' })).toEqual([])
    expect(await loadNewMods({ tags: 'git' })).toEqual([])
    expect(await loadNewMods({ kind: 'mods' })).toEqual([])
  })
})
