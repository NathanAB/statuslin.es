import { describe, expect, it } from 'vitest'
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
    expect(entryFor(xml, `${BASE}/guide`)).toContain('<lastmod>2026-09-23</lastmod>')
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
