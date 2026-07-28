// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, waitFor } from '@testing-library/react'
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
})
