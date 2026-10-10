import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { openTestDb, seedMod, type TestDb } from './seed-mods'

const testState = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/db', () => ({
  get db() {
    return testState.db
  },
}))
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (handler: () => unknown) => handler,
  createServerFn: () => {
    const handler = () => () => undefined
    return { handler, inputValidator: () => ({ handler }) }
  },
}))

const BASE = 'https://staging.statuslin.es'

let db: TestDb
let close: () => Promise<void>
let discovery: typeof import('@/mods/discovery')

beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_URL', `${BASE}/`)
  ;({ db, close } = await openTestDb())
  testState.db = db
  const meter = await seedMod(db, 'context-meter', 'published', 'a')
  await db
    .update(schema.mods)
    .set({ title: 'Context Meter', description: 'Shows how full\n the context is', copyCount: 3 })
    .where(eq(schema.mods.id, meter.modId))
  await db
    .update(schema.modVersions)
    .set({ createdAt: new Date('2026-09-30T12:00:00Z') })
    .where(eq(schema.modVersions.id, meter.versionId))
  await seedMod(db, 'draft-mod', 'draft', 'b')
  await seedMod(db, 'removed-mod', 'removed', 'c')
  discovery = await import('@/mods/discovery')
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await close()
})

describe('sitemap with mods', () => {
  it("lists each published mod's page with its current version's date", async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(
      `<url>\n    <loc>${BASE}/mods/context-meter</loc>\n    <lastmod>2026-09-30</lastmod>\n  </url>\n</urlset>`,
    )
  })

  it('omits draft and removed mods', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).not.toContain('/mods/draft-mod')
    expect(xml).not.toContain('/mods/removed-mod')
  })

  it('keeps the sitemap content type and cache header', async () => {
    const response = await discovery.sitemapWithModsForRoute()

    expect(response.headers.get('content-type')).toMatch(/application\/xml/)
    expect(response.headers.get('cache-control')).toBe('max-age=3600')
  })
})

describe('llms.txt with mods', () => {
  it('lists published mods under their own section', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toMatch(
      /\n## Mods\n\n- \[Context Meter\]\(https:\/\/staging\.statuslin\.es\/mods\/context-meter\): Shows how full the context is\. Copied 3 times\.\n$/,
    )
    expect(txt).not.toContain('draft-mod')
    expect(txt).not.toContain('removed-mod')
  })

  it('no longer says every submission is a shell script', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).not.toMatch(/every submission is a shell script/i)
    expect(txt).toContain(
      'status line shell scripts, which the community submits, and mods, which are Claude Code plugins',
    )
  })

  it('keeps the llms.txt content type', async () => {
    const response = await discovery.llmsTxtWithModsForRoute()

    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })
})
