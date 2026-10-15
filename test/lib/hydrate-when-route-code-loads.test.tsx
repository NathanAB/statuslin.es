// @vitest-environment jsdom
import { createMemoryHistory, lazyRouteComponent, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/posthog-client-errors', () => ({
  connectPostHogClientErrors: vi.fn(),
  queuePostHogClientError: vi.fn(),
}))

const { getRouter } = await import('@/router')
const { hydrateWhenRouteCodeLoads } = await import('@/lib/hydrate-when-route-code-loads')

const SERVER_HTML = '<main><h1>Terms of use</h1></main>'
const termsRoute = getRouter().routesById['/terms']
const termsComponent = termsRoute.options.component
const termsLazyFn = termsRoute.lazyFn

function Terms() {
  return <h1>Terms of use</h1>
}

// The real code-split wrapper: its preload() resolves even when the import fails.
async function routerAtTerms(importChunk: () => Promise<{ default: typeof Terms }>) {
  const router = getRouter()
  router.update({ history: createMemoryHistory({ initialEntries: ['/terms'] }) })
  router.routesById['/terms'].options.component = lazyRouteComponent(importChunk)
  await router.load()
  return router
}

function hydrateInto(container: HTMLElement, router: Awaited<ReturnType<typeof routerAtTerms>>) {
  return () => {
    render(<RouterProvider router={router} />, { container })
  }
}

beforeEach(() => {
  window.scrollTo = vi.fn()
  document.body.innerHTML = ''
})

// Routes are module singletons shared by every router, so undo the stubs.
afterEach(() => {
  if (termsComponent) termsRoute.options.component = termsComponent
  if (termsLazyFn) termsRoute.lazyFn = termsLazyFn
  else delete termsRoute.lazyFn
})

describe('hydrateWhenRouteCodeLoads', () => {
  // Google's renderer can fail to fetch one route chunk. Hydrating then swaps a good server page
  // for the error screen, which is what Google indexed. Leaving the server HTML keeps the content.
  it('leaves the server HTML in place when a route chunk fails on the first load', async () => {
    const container = document.createElement('div')
    container.innerHTML = SERVER_HTML
    document.body.append(container)
    const router = await routerAtTerms(() => Promise.reject(new Error('failed to fetch chunk')))

    await act(() => hydrateWhenRouteCodeLoads(router, hydrateInto(container, router)))

    expect(container.innerHTML).toBe(SERVER_HTML)
    expect(screen.queryByText('This page couldn’t load')).toBeNull()
  })

  it('skips hydration when a route file fails to load', async () => {
    const router = await routerAtTerms(() => Promise.resolve({ default: Terms }))
    termsRoute.lazyFn = () => Promise.reject(new Error('failed to fetch route file'))
    const hydrate = vi.fn()

    await hydrateWhenRouteCodeLoads(router, hydrate)

    expect(hydrate).not.toHaveBeenCalled()
  })

  it('hydrates when every matched route chunk loads', async () => {
    const router = await routerAtTerms(() => Promise.resolve({ default: Terms }))
    const hydrate = vi.fn()

    await hydrateWhenRouteCodeLoads(router, hydrate)

    expect(hydrate).toHaveBeenCalledOnce()
  })
})
