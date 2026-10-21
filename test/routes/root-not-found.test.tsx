// @vitest-environment node
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NOT_FOUND_TITLE } from '@/lib/page-title'
import { serverResult } from './server-result'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))

const { getRouter } = await import('@/router')

describe('an unknown path', () => {
  it('returns a 404 page inside the site header and footer', async () => {
    const router = getRouter()
    router.update({ history: createMemoryHistory({ initialEntries: ['/nope'] }) })

    await router.load()
    const html = renderToString(<RouterProvider router={router} />)

    expect(serverResult(router)).toMatchObject({ type: 'render', status: 404 })
    expect(html).toContain(`<title>${NOT_FOUND_TITLE}</title>`)
    expect(html).toContain('<header')
    expect(html).toContain('<footer')
    expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/)
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Back to gallery<\/a>/)
  })
})
