import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { PAGE_SIZE } from '@/gallery/queries'
import { addPublishedConfig } from '../gallery/seed-configs'
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
    return { handler, validator: () => ({ handler }) }
  },
}))

const BASE = 'https://staging.statuslin.es'
const LINE_COPY = { summary: 'Prints hi.', howItWorks: ['Runs `echo hi`.'], goodToKnow: [] }
const METER_COPY = {
  summary: 'Shows how full the context window is.',
  howItWorks: ['Reads the session usage.'],
  goodToKnow: ['Draws in the terminal only.'],
}

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
    .set({
      title: 'Context Meter',
      description: 'Shows how full\n the context is',
      copyCount: 3,
      allTags: ['minimal'],
    })
    .where(eq(schema.mods.id, meter.modId))
  await db
    .update(schema.modVersions)
    .set({ createdAt: new Date('2026-09-30T12:00:00Z') })
    .where(eq(schema.modVersions.id, meter.versionId))
  // A full first page of status lines, so the one mod alone spills onto page 2. Two of them are
  // minimal: with the minimal mod that makes three, enough to index the facet.
  for (let i = 0; i < PAGE_SIZE; i++) {
    await addPublishedConfig(db, `line-${i}`, { allTags: i < 2 ? ['minimal'] : [] })
  }
  await db.update(schema.configs).set({ createdAt: new Date('2026-09-01T00:00:00Z') })
  await setConfigCopy('line-0', LINE_COPY)
  await setConfigCopy('line-1', { summary: 'Copy in an older format.', bullets: ['Old.'] })
  await db
    .update(schema.modVersions)
    .set({ generatedContent: METER_COPY })
    .where(eq(schema.modVersions.id, meter.versionId))
  const removedLine = await addPublishedConfig(db, 'removed-line')
  await db
    .update(schema.configs)
    .set({ status: 'removed' })
    .where(eq(schema.configs.id, removedLine))
  await seedMod(db, 'draft-mod', 'draft', 'b')
  await seedMod(db, 'removed-mod', 'removed', 'c')
  discovery = await import('@/mods/discovery')
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await close()
})

async function setConfigCopy(slug: string, generatedContent: unknown) {
  const [config] = await db
    .select({ versionId: schema.configs.currentVersionId })
    .from(schema.configs)
    .where(eq(schema.configs.slug, slug))
  await db
    .update(schema.configVersions)
    .set({ generatedContent })
    .where(eq(schema.configVersions.id, config?.versionId as string))
}

describe('sitemap with mods', () => {
  it("lists each published mod's page with its current version's date", async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(
      `<url>\n    <loc>${BASE}/mods/context-meter</loc>\n    <lastmod>2026-09-30</lastmod>\n  </url>\n</urlset>`,
    )
  })

  it('counts mods toward the gallery pages it lists', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(`<loc>${BASE}/?page=2</loc>`)
    expect(xml).not.toContain(`<loc>${BASE}/?page=3</loc>`)
  })

  it('lists a facet that mods make indexable, dated by its newest mod', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(
      `<loc>${BASE}/status-lines/minimal</loc>\n    <lastmod>2026-09-30</lastmod>`,
    )
  })

  it('dates the homepage from a mod newer than every status line', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(`<loc>${BASE}</loc>\n    <lastmod>2026-09-30</lastmod>`)
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
      /\n## Mods\n\n- \[Context Meter\]\(https:\/\/staging\.statuslin\.es\/mods\/context-meter\): Shows how full the context is\. Installed 3 times\.\n\n## Optional\n/,
    )
    expect(txt).not.toContain('draft-mod')
    expect(txt).not.toContain('removed-mod')
  })

  it('links a facet that mods make indexable', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toContain(`(${BASE}/status-lines/minimal)`)
  })

  it('no longer says every submission is a shell script', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).not.toMatch(/every submission is a shell script/i)
    expect(txt).toContain('Status lines are scripts')
    expect(txt).toContain('Mods are Claude Code plugins')
  })

  it('keeps the llms.txt content type', async () => {
    const response = await discovery.llmsTxtWithModsForRoute()

    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })
})

describe('llms-full.txt with mods', () => {
  it('lists every published status line and mod with its tags and page copy', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    for (let i = 0; i < PAGE_SIZE; i++)
      expect(txt).toContain(`### [line-${i}](${BASE}/c/line-${i})`)
    expect(txt).toContain(
      [
        `### [line-0](${BASE}/c/line-0)`,
        '',
        '- Tags: minimal',
        '- Summary: Prints hi.',
        '- How it works:',
        '  1. Runs `echo hi`.',
      ].join('\n'),
    )
    expect(txt).toContain(
      [
        '## Mods',
        '',
        `### [Context Meter](${BASE}/mods/context-meter)`,
        '',
        '- Description: Shows how full the context is',
        '- Installed 3 times.',
        '- Tags: minimal',
        '- Summary: Shows how full the context window is.',
        '- How it works:',
        '  1. Reads the session usage.',
        '- Good to know:',
        '  - Draws in the terminal only.',
      ].join('\n'),
    )
  })

  it('treats page copy stored in an older format as missing', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    expect(txt).toContain(`### [line-1](${BASE}/c/line-1)\n\n- Tags: minimal\n\n###`)
    expect(txt).not.toContain('Copy in an older format.')
  })

  it('leaves out every status line and mod that is not published', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    expect(txt).not.toContain('removed-line')
    expect(txt).not.toContain('draft-mod')
    expect(txt).not.toContain('removed-mod')
  })

  it('links a facet that mods make indexable', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    expect(txt).toContain(`(${BASE}/status-lines/minimal)`)
  })

  it('has the llms.txt content type and cache header', async () => {
    const [full, short] = await Promise.all([
      discovery.llmsFullTxtWithModsForRoute(),
      discovery.llmsTxtWithModsForRoute(),
    ])

    expect(full.headers.get('content-type')).toBe(short.headers.get('content-type'))
    expect(full.headers.get('cache-control')).toBe(short.headers.get('cache-control'))
  })
})
