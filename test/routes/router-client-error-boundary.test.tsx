// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queuePostHogClientError = vi.fn()

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/posthog-client-errors', () => ({
  connectPostHogClientErrors: vi.fn(),
  queuePostHogClientError,
}))

const { getRouter } = await import('@/router')

beforeEach(() => {
  window.scrollTo = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client router error boundary', () => {
  it('reports a rejected child component preload through the configured catch hook', async () => {
    const chunkError = new Error('failed to fetch route chunk')
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/terms'] }),
    })
    router.routesById['/terms'].options.component = Object.assign(() => null, {
      preload: vi.fn().mockRejectedValue(chunkError),
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(queuePostHogClientError).toHaveBeenCalledWith(chunkError, expect.any(Object))
    })
  })

  // Google renders pages in a browser and can fail to fetch one route chunk. The error screen it
  // then sees must not deindex a good page; a server-side failure already returns HTTP 500.
  it('shows the error screen without a noindex tag when a route chunk fails in the browser', async () => {
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/terms'] }),
    })
    router.routesById['/terms'].options.component = Object.assign(() => null, {
      preload: vi.fn().mockRejectedValue(new Error('failed to fetch route chunk')),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'This page couldn’t load' })).toBeTruthy()
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })
})
