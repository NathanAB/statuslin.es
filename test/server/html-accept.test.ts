import { describe, expect, it, vi } from 'vitest'

import { htmlAcceptMiddleware } from '@/server/html-accept'

async function acceptSeenDownstream(url: string, init: RequestInit): Promise<string | null> {
  const request = new Request(url, init)
  await htmlAcceptMiddleware.options.server?.({
    request,
    pathname: new URL(url).pathname,
    context: undefined,
    handlerType: 'router',
    next: vi.fn().mockResolvedValue({}),
  })
  return request.headers.get('Accept')
}

describe('htmlAcceptMiddleware', () => {
  it('serves HTML to page GETs that ask for a non-HTML type', async () => {
    expect(
      await acceptSeenDownstream('https://statuslin.es/guide', {
        headers: { accept: 'text/markdown' },
      }),
    ).toBe('text/html')
    expect(
      await acceptSeenDownstream('https://statuslin.es/c/activity-feed', {
        headers: { accept: 'application/json' },
      }),
    ).toBe('text/html')
  })

  it('leaves requests that already accept HTML alone', async () => {
    expect(
      await acceptSeenDownstream('https://statuslin.es/guide', {
        headers: { accept: 'text/html,application/xhtml+xml' },
      }),
    ).toBe('text/html,application/xhtml+xml')
    expect(
      await acceptSeenDownstream('https://statuslin.es/guide', {
        headers: { accept: 'application/json, */*;q=0.8' },
      }),
    ).toBe('application/json, */*;q=0.8')
  })

  it('never touches server functions, API routes, files, or non-GET requests', async () => {
    const json = { headers: { accept: 'application/json' } }
    expect(await acceptSeenDownstream('https://statuslin.es/_serverFn/abc', json)).toBe(
      'application/json',
    )
    expect(await acceptSeenDownstream('https://statuslin.es/api/health', json)).toBe(
      'application/json',
    )
    expect(await acceptSeenDownstream('https://statuslin.es/sitemap.xml', json)).toBe(
      'application/json',
    )
    expect(await acceptSeenDownstream('https://statuslin.es/og/home.png', json)).toBe(
      'application/json',
    )
    expect(
      await acceptSeenDownstream('https://statuslin.es/guide', { ...json, method: 'POST' }),
    ).toBe('application/json')
  })
})
