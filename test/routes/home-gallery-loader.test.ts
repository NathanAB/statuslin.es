import { isNotFound } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ConfigPageCopy, ModPageCopy } from '@/content/types'
import * as schema from '@/db/schema'
import { PAGE_SIZE } from '@/gallery/queries'
import { addPublishedConfig, currentVersionOf } from '../gallery/seed-configs'
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
  return versionId
}

const MOD_COPY: ModPageCopy = {
  summary: 'Draws a forecast under the prompt.',
  howItWorks: [],
  goodToKnow: [],
  details: {},
}
const CONFIG_COPY: ConfigPageCopy = {
  summary: 'Counts your commits since lunch.',
  howItWorks: [],
  goodToKnow: [],
  details: {},
}
/** Published items in all: the two mods, the extra ones, and one status line. */
const TOTAL = PAGE_SIZE + 3

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  testState.db = db
  const weatherVersion = await addPublishedMod('token-weather-usage')
  await db
    .update(schema.modVersions)
    .set({ generatedContent: MOD_COPY })
    .where(eq(schema.modVersions.id, weatherVersion))
  await addPublishedMod('other-mod')
  for (let i = 0; i < TOTAL - 3; i++) await addPublishedMod(`extra-mod-${i}`)
  const configId = await addPublishedConfig(db, 'commit-line')
  await db
    .update(schema.configVersions)
    .set({ generatedContent: CONFIG_COPY })
    .where(eq(schema.configVersions.id, await currentVersionOf(db, configId)))
  await db.update(schema.user).set({ username: 'linewriter' })
  HomeRoute = (await import('@/routes/index')).Route
})
afterAll(async () => {
  await close()
})

function loadHome(search: { kind?: 'mods' } = {}, page?: number) {
  const loader = HomeRoute.options.loader as (ctx: unknown) => Promise<{
    entries: Array<{ item: { kind: string; card: { slug: string } }; searchText: string }>
  }>
  return loader({ deps: search, location: { search: page === undefined ? {} : { page } } })
}

describe('home gallery loader', () => {
  // token-weather-usage was held back for a featured row below the gallery; that row is gone.
  it('lists every published mod, none held back', async () => {
    const { entries } = await loadHome({ kind: 'mods' })
    const slugs = entries.map(({ item }) => item.card.slug)
    expect(slugs).toContain('other-mod')
    expect(slugs).toContain('token-weather-usage')
  })

  // The search filters in the browser, so the page needs every item, not only one page of them.
  it('returns every published item, past the first page, whatever page the URL asks for', async () => {
    expect((await loadHome()).entries).toHaveLength(TOTAL)
    expect((await loadHome({}, 2)).entries).toHaveLength(TOTAL)
  })

  it("gives each item its search text: a mod's author and copy, a status line's author and copy", async () => {
    const { entries } = await loadHome()
    const textOf = (kind: string, slug: string) =>
      entries.find(({ item }) => item.kind === kind && item.card.slug === slug)?.searchText
    expect(textOf('mod', 'token-weather-usage')).toContain('octocat')
    expect(textOf('mod', 'token-weather-usage')).toContain('draws a forecast')
    expect(textOf('status-line', 'commit-line')).toContain('linewriter')
    expect(textOf('status-line', 'commit-line')).toContain('counts your commits')
  })

  it('serves the last page and 404s a page past it', async () => {
    await expect(loadHome({}, 2)).resolves.toBeDefined()
    await expect(loadHome({}, 3)).rejects.toSatisfy(isNotFound)
  })
})
