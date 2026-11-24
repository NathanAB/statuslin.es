import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { PAGE_SIZE } from '@/gallery/queries'
import { getMarketplaceRows } from '@/mods/queries'
import { addPublishedConfig } from '../gallery/seed-configs'
import {
  addDesktopTheme,
  addMod,
  addShownDraft,
  addTheme,
  addVersion,
  openTestDb,
  REPO_URL,
  SEEDED_THEME_PREVIEW,
  seedMod,
  setCurrentVersion,
  sha,
  type TestDb,
} from './seed-mods'

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
  // A theme plugin, newer than every mod and status line: themes count toward /themes, never
  // toward the gallery or /mods (ADR 0012).
  const glow = await seedMod(db, 'glow-themes', 'published', 'e')
  await db
    .update(schema.mods)
    .set({ title: 'Glow Themes', description: 'Warm colors for the terminal', copyCount: 2 })
    .where(eq(schema.mods.id, glow.modId))
  await db
    .update(schema.modVersions)
    .set({ createdAt: new Date('2026-10-05T12:00:00Z') })
    .where(eq(schema.modVersions.id, glow.versionId))
  await addTheme(db, glow.versionId, { key: 'glow', name: 'Glow' })
  await addTheme(db, glow.versionId, { key: 'nord-glow', name: 'Nord Glow' })
  await seedMod(db, 'draft-mod', 'draft', 'b')
  await seedMod(db, 'removed-mod', 'removed', 'c')
  const unreviewed = {
    description: 'A token meter.',
    path: '',
    commitSha: sha('d'),
    committedAt: new Date('2026-11-01T00:00:00Z'),
    stars: 3,
    footprint: { events: [], calls: [] },
    validatedWith: '2.1.296',
    checkedAt: new Date('2026-11-12T08:00:00Z'),
  }
  await db.insert(schema.unreviewedMods).values([
    {
      ...unreviewed,
      owner: 'OctoCat',
      pluginName: 'token-meter',
      repoUrl: 'https://github.com/OctoCat/token-meter',
    },
    // The folder context-meter's live version pins: its address redirects to the listing.
    { ...unreviewed, owner: 'octocat', pluginName: 'meter', repoUrl: REPO_URL },
  ])
  // A curated Desktop theme pack shown as an unreviewed mod (ADR 0014), with a Catppuccin look.
  const looks = await addShownDraft(db, {
    slug: 'looks-pack',
    pluginName: 'looks',
    repoUrl: 'https://github.com/Ada/looks',
    description: 'Forty looks for Claude Desktop.',
  })
  await db
    .update(schema.modVersions)
    .set({ createdAt: new Date('2026-11-20T10:00:00Z') })
    .where(eq(schema.modVersions.id, looks.versionId))
  await addDesktopTheme(db, looks.versionId, { key: 'latte', name: 'Catppuccin Latte' })
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

  it('lists /themes, dated by the newest plugin that carries themes', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(`<loc>${BASE}/themes</loc>\n    <lastmod>2026-10-05</lastmod>`)
  })

  it('lists the page of each palette with a published theme, dated by its newest theme, and no other', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(`<loc>${BASE}/themes/nord</loc>\n    <lastmod>2026-10-05</lastmod>`)
    expect(xml).not.toContain(`${BASE}/themes/catppuccin`)
  })

  it("lists a theme plugin's page without dating /mods by it", async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(`<loc>${BASE}/mods/glow-themes</loc>\n    <lastmod>2026-10-05</lastmod>`)
    expect(xml).toContain(`<loc>${BASE}/mods</loc>\n    <lastmod>2026-09-30</lastmod>`)
  })

  it('omits draft and removed mods', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).not.toContain('/mods/draft-mod')
    expect(xml).not.toContain('/mods/removed-mod')
  })

  it("lists each unreviewed mod's page with the day it was checked, unless it redirects", async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(
      `<url>\n    <loc>${BASE}/mods/unreviewed/OctoCat/token-meter</loc>\n    <lastmod>2026-11-12</lastmod>\n  </url>`,
    )
    expect(xml).not.toContain('/mods/unreviewed/octocat/meter')
  })

  it("lists a shown curated draft's unreviewed page, never its slug, and makes no palette page of its themes", async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).toContain(
      `<url>\n    <loc>${BASE}/mods/unreviewed/Ada/looks</loc>\n    <lastmod>2026-11-20</lastmod>\n  </url>`,
    )
    expect(xml).not.toContain('looks-pack')
    expect(xml).not.toContain(`${BASE}/themes/catppuccin`)
  })

  it('keeps the sitemap content type and cache header', async () => {
    const response = await discovery.sitemapWithModsForRoute()

    expect(response.headers.get('content-type')).toMatch(/application\/xml/)
    expect(response.headers.get('cache-control')).toBe('max-age=3600')
  })
})

describe('llms.txt with mods', () => {
  it('lists published mods under their own section, then theme plugins under Themes', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toContain(
      [
        '## Mods',
        '',
        `- [Context Meter](${BASE}/mods/context-meter): Shows how full the context is. Installed 3 times.`,
        '',
        '## Themes',
        '',
        `- [Glow Themes](${BASE}/mods/glow-themes): Warm colors for the terminal. Installed 2 times.`,
        '',
        '## Optional',
      ].join('\n'),
    )
    expect(txt).not.toContain('draft-mod')
    expect(txt).not.toContain('removed-mod')
    expect(txt).not.toContain('unreviewed')
  })

  it('links the page of each palette with a published theme, and no other', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toContain(
      `## Themes by palette\n\n- [Nord themes](${BASE}/themes/nord): every published Nord theme, each previewed in a real session`,
    )
    expect(txt).not.toContain(`${BASE}/themes/catppuccin`)
  })

  it('links /themes beside the mods page', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toMatch(
      new RegExp(
        `\\n- \\[Mods\\]\\(${BASE}/mods\\): [^\\n]+\\n- \\[Themes\\]\\(${BASE}/themes\\): `,
      ),
    )
  })

  it('links a facet that mods make indexable, by its page heading', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toContain(
      `[Minimal Claude Code status lines and mods](${BASE}/status-lines/minimal)`,
    )
  })

  it('no longer says every submission is a shell script', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).not.toMatch(/every submission is a shell script/i)
    expect(txt).toContain('Status lines are scripts')
    expect(txt).toContain('mods are Claude Code plugins')
  })

  it('leaves out a shown curated draft and its themes, which installs nothing', async () => {
    for (const route of [
      discovery.llmsTxtWithModsForRoute,
      discovery.llmsFullTxtWithModsForRoute,
    ]) {
      const txt = await (await route()).text()

      expect(txt).not.toContain('looks')
      expect(txt).not.toContain('Catppuccin')
    }
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

  it('lists theme plugins in their own Themes section, after the mods', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    expect(txt).toContain(
      [
        '## Themes',
        '',
        `### [Glow Themes](${BASE}/mods/glow-themes)`,
        '',
        '- Description: Warm colors for the terminal',
        '- Installed 2 times.',
      ].join('\n'),
    )
    expect(txt.indexOf('## Themes\n')).toBeGreaterThan(txt.indexOf('### [Context Meter]'))
  })

  it('links the page of each palette with a published theme', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    expect(txt).toContain(`## Themes by palette\n\n- [Nord themes](${BASE}/themes/nord)`)
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
    expect(txt).not.toContain('token-meter')
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

// A Desktop theme is set by a mod, which /themes lists beside the theme plugins.
describe('with a mod that sets a Desktop theme', () => {
  let nightId: string
  beforeAll(async () => {
    nightId = await addMod(db, 'night-desktop', 'published')
    const night = await addVersion(db, nightId, {
      commitSha: sha('9'),
      versionNumber: 1,
      hooksModules: ['./register.ts'],
    })
    await setCurrentVersion(db, nightId, night)
    await db
      .update(schema.mods)
      .set({ title: 'Night Desktop', description: 'A dark Desktop theme', copyCount: 1 })
      .where(eq(schema.mods.id, nightId))
    await addDesktopTheme(db, night, { key: 'night', name: 'Night' })
  })
  afterAll(async () => {
    await db.update(schema.mods).set({ status: 'removed' }).where(eq(schema.mods.id, nightId))
  })

  it('lists it in llms.txt under Themes, after the theme plugin, and not under Mods', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).toContain(
      [
        '## Mods',
        '',
        `- [Context Meter](${BASE}/mods/context-meter): Shows how full the context is. Installed 3 times.`,
        '',
        '## Themes',
        '',
        `- [Glow Themes](${BASE}/mods/glow-themes): Warm colors for the terminal. Installed 2 times.`,
        `- [Night Desktop](${BASE}/mods/night-desktop): A dark Desktop theme. Installed 1 time.`,
        '',
      ].join('\n'),
    )
  })

  it('lists it in llms-full.txt under Themes, and not under Mods', async () => {
    const txt = await (await discovery.llmsFullTxtWithModsForRoute()).text()

    expect(txt.indexOf('### [Night Desktop]')).toBeGreaterThan(txt.indexOf('## Themes'))
    expect(txt.match(/### \[Night Desktop\]/g)).toHaveLength(1)
  })
})

describe('with a published theme that has no preview', () => {
  beforeAll(async () => {
    await db
      .delete(schema.modThemePreviews)
      .where(
        inArray(
          schema.modThemePreviews.themeId,
          db.select({ id: schema.modThemes.id }).from(schema.modThemes),
        ),
      )
  })
  afterAll(async () => {
    const themes = await db.select({ id: schema.modThemes.id }).from(schema.modThemes)
    await db
      .insert(schema.modThemePreviews)
      .values(themes.map((theme) => ({ themeId: theme.id, ...SEEDED_THEME_PREVIEW })))
  })

  // /themes shows no card for it and is noindex, so the sitemap leaves /themes out.
  it('leaves /themes out of the sitemap', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).not.toContain(`<loc>${BASE}/themes</loc>`)
  })
})

describe('with no theme published', () => {
  beforeAll(async () => {
    await db
      .update(schema.mods)
      .set({ status: 'removed' })
      .where(eq(schema.mods.slug, 'glow-themes'))
  })
  afterAll(async () => {
    await db
      .update(schema.mods)
      .set({ status: 'published' })
      .where(eq(schema.mods.slug, 'glow-themes'))
  })

  // /themes is noindex while it has no cards, so the sitemap leaves it out.
  it('leaves /themes out of the sitemap', async () => {
    const xml = await (await discovery.sitemapWithModsForRoute()).text()

    expect(xml).not.toContain(`<loc>${BASE}/themes</loc>`)
  })

  it('has no Themes section in llms.txt', async () => {
    const txt = await (await discovery.llmsTxtWithModsForRoute()).text()

    expect(txt).not.toContain('## Themes')
  })
})

describe('marketplace with a shown curated draft', () => {
  it('leaves the draft out of /marketplace.json', async () => {
    const slugs = (await getMarketplaceRows(db)).map((row) => row.slug)

    expect(slugs).toContain('context-meter')
    expect(slugs).not.toContain('looks-pack')
  })
})
