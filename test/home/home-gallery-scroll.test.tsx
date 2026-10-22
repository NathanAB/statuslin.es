// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}))

const { HomeGallery } = await import('@/home/home-gallery')

const scrollIntoView = vi.fn()

beforeEach(() => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
})

function prefersReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
  })) as unknown as typeof window.matchMedia
}

/** A real router, with the app's scroll restoration, whose "/" renders only the gallery. */
async function renderGallery() {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => search,
    component: function Home() {
      const search = homeRoute.useSearch()
      const page = typeof search.page === 'number' ? search.page : 1
      return (
        <HomeGallery
          items={[]}
          page={page}
          pageCount={3}
          sort="top"
          rawKind={undefined}
          tags={undefined}
        />
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    scrollRestoration: true,
  })
  render(<RouterProvider router={router} />)
  await screen.findAllByRole('navigation', { name: 'Gallery pages' })
  return router
}

/** Clicks the first "Next page" and resolves once the router has rendered that page. */
async function nextPage(router: Awaited<ReturnType<typeof renderGallery>>) {
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe()
      resolve()
    })
  })
  scrollIntoView.mockClear()
  await act(async () => {
    fireEvent.click(screen.getAllByRole('link', { name: 'Next page' })[0] as HTMLElement)
    await rendered
  })
}

describe('HomeGallery paging scrolls to the list', () => {
  it('glides to the gallery, so the reader sees where the new page is', async () => {
    prefersReducedMotion(false)
    const router = await renderGallery()

    await nextPage(router)

    expect(router.state.location.hash).toBe('gallery')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('jumps instead when the reader prefers reduced motion', async () => {
    prefersReducedMotion(true)
    const router = await renderGallery()

    await nextPage(router)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })
})
