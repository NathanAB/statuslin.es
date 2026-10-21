import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
      validator: (validator: (data: never) => unknown) => ({
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
  await addPublishedMod('token-weather-usage')
  await addPublishedMod('other-mod')
  HomeRoute = (await import('@/routes/index')).Route
})
afterAll(async () => {
  await close()
})

function loadHome(search: { kind?: 'mods' } = {}) {
  const loader = HomeRoute.options.loader as (ctx: unknown) => Promise<{
    gallery: { items: Array<{ kind: string; card: { slug: string } }> }
  }>
  return loader({ deps: search })
}

describe('home gallery loader', () => {
  // token-weather-usage was held back for a featured row below the gallery; that row is gone.
  it('lists every published mod, none held back', async () => {
    const { gallery } = await loadHome({ kind: 'mods' })
    expect(gallery.items.map((item) => item.card.slug).sort()).toEqual([
      'other-mod',
      'token-weather-usage',
    ])
  })
})
