import { describe, expect, it, vi } from 'vitest'

import { canonicalRedirect, canonicalRedirectMiddleware } from '@/server/canonical-redirect'

describe('canonicalRedirect', () => {
  it('strips a trailing slash and keeps the query string', () => {
    expect(canonicalRedirect('https://statuslin.es/guide/')).toBe('/guide')
    expect(canonicalRedirect('https://statuslin.es/status-lines/git/?x=1')).toBe(
      '/status-lines/git?x=1',
    )
    expect(canonicalRedirect('https://statuslin.es/resources//')).toBe('/resources')
  })

  it('leaves the root and canonical paths alone', () => {
    expect(canonicalRedirect('https://statuslin.es/')).toBe(null)
    expect(canonicalRedirect('https://statuslin.es/status-lines/git?x=1')).toBe(null)
  })
})

async function runMiddleware(url: string) {
  const request = new Request(url)
  const pathname = new URL(url).pathname
  return canonicalRedirectMiddleware.options.server?.({
    request,
    pathname,
    context: undefined,
    handlerType: 'router',
    next: vi.fn().mockResolvedValue({
      request,
      pathname,
      context: undefined,
      response: new Response('page', { status: 200 }),
    }),
  })
}

describe('canonicalRedirectMiddleware', () => {
  it('answers a non-canonical URL with a 308 to the canonical one', async () => {
    const response = (await runMiddleware('https://statuslin.es/status-lines/git/?x=1')) as Response

    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe('/status-lines/git?x=1')
  })

  it('passes a canonical URL through to the page', async () => {
    const result = (await runMiddleware('https://statuslin.es/guide')) as { response: Response }

    expect(result.response.status).toBe(200)
    expect(await result.response.text()).toBe('page')
  })
})
