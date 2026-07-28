// @vitest-environment node
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const queuePostHogClientError = vi.fn()

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/posthog-client-errors', () => ({
  queuePostHogClientError,
}))

const { getRouter } = await import('@/router')

describe('router error boundary', () => {
  it('preserves the document when a child route component preload rejects', async () => {
    const chunkError = new Error('failed to fetch route chunk')
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/terms'] }),
    })
    router.routesById['/terms'].options.component = Object.assign(() => null, {
      preload: vi.fn().mockRejectedValue(chunkError),
    })

    await router.load()
    const html = renderToString(<RouterProvider router={router} />)

    expect(router.stores.statusCode.get()).toBe(500)
    expect(html).toContain('<html')
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
    expect(html).toContain('This page couldn’t load')
    expect(html).toContain('<meta name="robots" content="noindex, follow"')
  })
})
