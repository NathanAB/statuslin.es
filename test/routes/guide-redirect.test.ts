// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))

const { getRouter } = await import('@/router')

describe('/guide redirect', () => {
  it('loads through the real router as a permanent redirect to /resources', async () => {
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/guide'] }),
    })

    await router.load()

    expect(router.stores.statusCode.get()).toBe(301)
    expect(router.stores.redirect.get()?.headers.get('Location')).toBe('/resources')
  })
})
