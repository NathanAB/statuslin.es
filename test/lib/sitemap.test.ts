import { describe, expect, it } from 'vitest'
import {
  BUDDY_GUIDE_DATES,
  DESKTOP_GUIDE_DATES,
  MOD_SAFETY_GUIDE_DATES,
  STATUS_LINES_VS_MODS_GUIDE_DATES,
} from '@/lib/page-title'
import { sitemapResponse } from '@/lib/sitemap'

const BASE = 'https://statuslin.es'

describe('sitemapResponse', () => {
  function entryFor(xml: string, loc: string): string {
    return (
      xml
        .split('  <url>')
        .find((entry) => entry.includes(`<loc>${loc}</loc>`))
        ?.split('  </url>')[0] ?? ''
    )
  }

  it('serves application/xml with a cache header', async () => {
    const res = sitemapResponse(BASE, [], [])
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/xml/)
    expect(res.headers.get('cache-control')).toMatch(/max-age/)
  })

  it('wraps entries in a valid urlset envelope', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('</urlset>')
  })

  it('includes the static home, guide, resources, and terms pages, not submit', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(xml).toContain(`<loc>${BASE}</loc>`)
    expect(xml).toContain(`<loc>${BASE}/guide</loc>`)
    expect(xml).toContain(`<loc>${BASE}/resources</loc>`)
    expect(xml).toContain(`<loc>${BASE}/terms</loc>`)
    expect(xml).not.toContain(`<loc>${BASE}/submit</loc>`)
  })

  it('lists the Claude Desktop guide with its modified date', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(entryFor(xml, `${BASE}/guide/claude-desktop`)).toContain(
      `<lastmod>${DESKTOP_GUIDE_DATES.modified}</lastmod>`,
    )
  })

  it('lists the status lines vs mods guide with its modified date', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(entryFor(xml, `${BASE}/guide/status-lines-vs-mods`)).toContain(
      `<lastmod>${STATUS_LINES_VS_MODS_GUIDE_DATES.modified}</lastmod>`,
    )
  })

  it('lists the mod safety guide with its modified date', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(entryFor(xml, `${BASE}/guide/are-claude-code-mods-safe`)).toContain(
      `<lastmod>${MOD_SAFETY_GUIDE_DATES.modified}</lastmod>`,
    )
  })

  it('lists the Claude Code buddy guide with its modified date', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(entryFor(xml, `${BASE}/guide/claude-code-buddy`)).toContain(
      `<lastmod>${BUDDY_GUIDE_DATES.modified}</lastmod>`,
    )
  })

  it('lists unfiltered gallery pages after page 1', async () => {
    const configs = Array.from({ length: 21 }, (_, i) => ({
      slug: `line-${i}`,
      updatedAt: new Date('2026-04-05T00:00:00Z'),
    }))
    const xml = await sitemapResponse(BASE, configs, [], 3).text()
    expect(xml).toContain(`<loc>${BASE}/?page=2</loc>`)
    expect(xml).toContain(`<loc>${BASE}/?page=3</loc>`)
    expect(xml).not.toContain(`<loc>${BASE}/?page=1</loc>`)
    expect(xml).not.toContain(`<loc>${BASE}/?page=4</loc>`)
  })

  it('emits a config url with a date-only lastmod from updatedAt', async () => {
    const config = {
      slug: 'my-line',
      updatedAt: new Date('2026-04-05T06:07:08Z'),
    }
    const xml = await sitemapResponse(BASE, [config], []).text()
    expect(xml).toContain(`<loc>${BASE}/c/my-line</loc>`)
    expect(entryFor(xml, `${BASE}/c/my-line`)).toContain('<lastmod>2026-04-05</lastmod>')
  })

  it('dates the homepage and its pages from the newest config, and the guide from its edit date', async () => {
    const configs = Array.from({ length: 11 }, (_, i) => ({
      slug: `line-${i}`,
      updatedAt: new Date(i === 3 ? '2026-05-06T00:00:00Z' : '2026-03-04T00:00:00Z'),
    }))
    const xml = await sitemapResponse(BASE, configs, [], 2).text()

    expect(entryFor(xml, BASE)).toContain('<lastmod>2026-05-06</lastmod>')
    expect(entryFor(xml, `${BASE}/?page=2`)).toContain('<lastmod>2026-05-06</lastmod>')
    expect(entryFor(xml, `${BASE}/guide`)).toContain('<lastmod>2026-10-15</lastmod>')
    for (const path of ['/resources', '/terms']) {
      expect(entryFor(xml, `${BASE}${path}`)).not.toContain('<lastmod>')
    }
  })

  it('xml-escapes ampersands in a slug', async () => {
    const date = new Date('2026-01-02T00:00:00Z')
    const xml = await sitemapResponse(BASE, [{ slug: 'a&b', updatedAt: date }], []).text()
    expect(xml).toContain(`<loc>${BASE}/c/a&amp;b</loc>`)
    expect(xml).not.toContain('/c/a&b<')
  })

  it('xml-escapes angle brackets in a slug', async () => {
    const date = new Date('2026-01-02T00:00:00Z')
    const xml = await sitemapResponse(BASE, [{ slug: 'a<b>c', updatedAt: date }], []).text()
    expect(xml).toContain(`<loc>${BASE}/c/a&lt;b&gt;c</loc>`)
  })

  it('lists the best page and the live comparison pages', async () => {
    const xml = await sitemapResponse(BASE, [], [], 1, [
      { path: '/status-lines/best', updatedAt: null },
      { path: '/alternatives/ccstatusline', updatedAt: new Date('2026-09-24T00:00:00Z') },
    ]).text()
    expect(entryFor(xml, `${BASE}/status-lines/best`)).not.toContain('<lastmod>')
    expect(entryFor(xml, `${BASE}/alternatives/ccstatusline`)).toContain(
      '<lastmod>2026-09-24</lastmod>',
    )
    expect(xml).not.toContain(`<loc>${BASE}/compare/`)
  })

  it('lists live facets with their newest-config lastmod', async () => {
    const res = sitemapResponse(
      'https://example.test',
      [],
      [
        { slug: 'git', latest: new Date('2026-06-02T00:00:00Z') },
        { slug: 'bash', latest: null },
      ],
    )
    const xml = await res.text()
    expect(xml).toContain('<loc>https://example.test/status-lines/git</loc>')
    expect(xml).toContain('<lastmod>2026-06-02</lastmod>')
    expect(xml).toContain('<loc>https://example.test/status-lines/bash</loc>')
  })
})

describe('sitemapResponse with mods', () => {
  it('lists no mods page when no mod is published', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()

    expect(xml).not.toContain(`<loc>${BASE}/mods</loc>`)
  })

  it('lists the mods page, dated by its newest mod, ahead of the mod pages', async () => {
    const xml = await sitemapResponse(
      BASE,
      [],
      [],
      1,
      [],
      [
        { slug: 'meter', updatedAt: new Date('2026-09-01T00:00:00Z') },
        { slug: 'tree', updatedAt: new Date('2026-10-02T00:00:00Z') },
      ],
    ).text()

    expect(xml).toContain(
      `<url>\n    <loc>${BASE}/mods</loc>\n    <lastmod>2026-10-02</lastmod>\n  </url>\n  <url>\n    <loc>${BASE}/mods/meter</loc>`,
    )
  })

  it('dates the homepage and its pages from a mod newer than every status line', async () => {
    const xml = await sitemapResponse(
      BASE,
      [{ slug: 'line', updatedAt: new Date('2026-09-01T00:00:00Z') }],
      [],
      2,
      [],
      [{ slug: 'meter', updatedAt: new Date('2026-10-02T00:00:00Z') }],
    ).text()

    expect(xml).toContain(`<loc>${BASE}</loc>\n    <lastmod>2026-10-02</lastmod>`)
    expect(xml).toContain(`<loc>${BASE}/?page=2</loc>\n    <lastmod>2026-10-02</lastmod>`)
  })
})
