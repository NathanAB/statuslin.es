import { afterEach, describe, expect, it, vi } from 'vitest'

import { NOINDEX_FLAG, noindexMiddleware } from '@/server/noindex'
import { startInstance } from '@/start'

async function responseThrough(url: string, downstream: Response): Promise<Response> {
  const request = new Request(url)
  const pathname = new URL(url).pathname
  const result = await noindexMiddleware.options.server?.({
    request,
    pathname,
    context: undefined,
    handlerType: 'router',
    next: vi
      .fn()
      .mockResolvedValue({ request, pathname, context: undefined, response: downstream }),
  })
  return (result as { response: Response }).response
}

function htmlPage(): Response {
  return new Response('<!doctype html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

describe('noindexMiddleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('tags an HTML page with X-Robots-Tag when the flag is on', async () => {
    vi.stubEnv(NOINDEX_FLAG, 'true')

    const response = await responseThrough('https://staging.statuslin.es/guide', htmlPage())

    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
  })

  it('tags non-HTML responses and redirects too when the flag is on', async () => {
    vi.stubEnv(NOINDEX_FLAG, 'true')

    const robots = await responseThrough(
      'https://staging.statuslin.es/robots.txt',
      new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } }),
    )
    const redirect = await responseThrough(
      'https://staging.statuslin.es/guide/',
      new Response(null, { status: 308, headers: { Location: '/guide' } }),
    )

    expect(robots.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(await robots.text()).toBe('User-agent: *\nAllow: /\n')
    expect(redirect.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(redirect.headers.get('Location')).toBe('/guide')
  })

  it('leaves responses untagged when the flag is unset', async () => {
    vi.stubEnv(NOINDEX_FLAG, undefined)

    const response = await responseThrough('https://statuslin.es/guide', htmlPage())

    expect(response.headers.has('X-Robots-Tag')).toBe(false)
  })

  it('runs first, so it also tags the 404s and redirects the other request middleware return', async () => {
    const { requestMiddleware } = await startInstance.getOptions()

    expect(requestMiddleware?.[0]).toBe(noindexMiddleware)
  })
})
