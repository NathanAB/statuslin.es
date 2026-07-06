import { describe, expect, it } from 'vitest'
import { sitemapResponse } from '@/lib/sitemap'

const BASE = 'https://statuslin.es'

describe('sitemapResponse', () => {
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

  it('includes the static home, guide, resources, submit, and terms pages', async () => {
    const xml = await sitemapResponse(BASE, [], []).text()
    expect(xml).toContain(`<loc>${BASE}</loc>`)
    expect(xml).toContain(`<loc>${BASE}/guide</loc>`)
    expect(xml).toContain(`<loc>${BASE}/resources</loc>`)
    expect(xml).toContain(`<loc>${BASE}/submit</loc>`)
    expect(xml).toContain(`<loc>${BASE}/terms</loc>`)
  })

  it('emits a config url with a date-only lastmod from createdAt', async () => {
    const xml = await sitemapResponse(
      BASE,
      [{ slug: 'my-line', createdAt: new Date('2026-01-02T03:04:05Z') }],
      [],
    ).text()
    expect(xml).toContain(`<loc>${BASE}/c/my-line</loc>`)
    expect(xml).toContain('<lastmod>2026-01-02</lastmod>')
  })

  it('xml-escapes ampersands in a slug', async () => {
    const xml = await sitemapResponse(
      BASE,
      [{ slug: 'a&b', createdAt: new Date('2026-01-02T00:00:00Z') }],
      [],
    ).text()
    expect(xml).toContain(`<loc>${BASE}/c/a&amp;b</loc>`)
    expect(xml).not.toContain('/c/a&b<')
  })

  it('xml-escapes angle brackets in a slug', async () => {
    const xml = await sitemapResponse(
      BASE,
      [{ slug: 'a<b>c', createdAt: new Date('2026-01-02T00:00:00Z') }],
      [],
    ).text()
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
