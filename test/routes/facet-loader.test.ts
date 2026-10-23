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
let FacetRoute: typeof import('@/routes/status-lines.$facet').Route

async function addStatusLine(slug: string, allTags: string[], copyCount: number) {
  const id = await addPublishedConfig(db, slug, { allTags })
  await db.update(schema.configs).set({ copyCount }).where(eq(schema.configs.id, id))
}

async function addPublishedMod(slug: string, allTags: string[], copyCount: number) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    repoUrl: `https://github.com/octocat/${slug}`,
  })
  await setCurrentVersion(db, modId, versionId)
  await db.update(schema.mods).set({ allTags, copyCount }).where(eq(schema.mods.id, modId))
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  testState.db = db
  // git and token-usage both reach the 3 matches that make a facet indexable.
  await addStatusLine('git-and-tokens', ['git', 'token-usage'], 50)
  await addStatusLine('git-only', ['git'], 40)
  await addStatusLine('tokens-high', ['token-usage'], 10)
  await addStatusLine('tokens-low', ['token-usage'], 1)
  await addPublishedMod('git-meter', ['git', 'token-usage'], 30)
  await addPublishedMod('tokens-meter', ['token-usage'], 20)
  FacetRoute = (await import('@/routes/status-lines.$facet')).Route
})
afterAll(async () => {
  await close()
})

async function loadFacet(facet: string) {
  const loader = FacetRoute.options.loader as (ctx: unknown) => Promise<{ items: GalleryItem[] }>
  return (await loader({ params: { facet } })).items.map((item) => `${item.kind}:${item.card.slug}`)
}

describe('facet page loader', () => {
  // Lists rank by installs, status lines and mods together. Ranking a topic's own lines first was
  // tried and dropped: a line's first tag decides its topic (git first), which is no real signal.
  it('lists a topic’s status lines and mods together by installs', async () => {
    expect(await loadFacet('token-usage')).toEqual([
      'status-line:git-and-tokens',
      'mod:git-meter',
      'mod:tokens-meter',
      'status-line:tokens-high',
      'status-line:tokens-low',
    ])
  })

  it('orders a single-topic page the same way', async () => {
    expect(await loadFacet('git')).toEqual([
      'status-line:git-and-tokens',
      'status-line:git-only',
      'mod:git-meter',
    ])
  })
})
