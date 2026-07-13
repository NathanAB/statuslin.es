import { describe, expect, it } from 'vitest'
import { buildRobotsTxt, robotsResponse } from '@/lib/robots'

describe('buildRobotsTxt', () => {
  const txt = buildRobotsTxt('https://statuslin.es')

  it('allows all crawlers (including AI bots via the wildcard)', () => {
    expect(txt).toMatch(/^User-agent: \*$/m)
    expect(txt).toMatch(/^Allow: \/$/m)
  })

  it('disallows the API but lets private pages expose their noindex tags', () => {
    expect(txt).toMatch(/^Disallow: \/api$/m)
    expect(txt).not.toMatch(/^Disallow: \/admin$/m)
    expect(txt).not.toMatch(/^Disallow: \/me$/m)
  })

  it('points at the absolute sitemap URL', () => {
    expect(txt).toMatch(/^Sitemap: https:\/\/statuslin\.es\/sitemap\.xml$/m)
  })
})

describe('robotsResponse', () => {
  it('serves text/plain with a cache header', async () => {
    const res = robotsResponse('https://statuslin.es')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/plain/)
    expect(res.headers.get('cache-control')).toMatch(/max-age/)
    expect(await res.text()).toContain('User-agent: *')
  })
})
