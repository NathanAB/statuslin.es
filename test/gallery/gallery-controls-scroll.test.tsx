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

const { GalleryControls } = await import('@/gallery/gallery-controls')
const { coerceGalleryFilter } = await import('@/gallery/gallery-items')
const { coerceSort } = await import('@/gallery/queries')

const scrollTo = vi.fn()

beforeEach(() => {
  window.scrollTo = scrollTo
})

/** A real router, with the app's scroll restoration, whose "/" renders only the controls. */
async function renderControls(initialUrl: string) {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => search,
    component: function Home() {
      const search = homeRoute.useSearch()
      const tags = typeof search.tags === 'string' ? search.tags.split(',') : []
      return (
        <GalleryControls
          kind={coerceGalleryFilter(search.kind)}
          sort={coerceSort(search.sort)}
          tags={tags}
        />
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    scrollRestoration: true,
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('radiogroup', { name: 'Show' })
  return router
}

/** Runs `interact`, then resolves once the router has rendered the navigation it started. */
async function afterNavigation(
  router: Awaited<ReturnType<typeof renderControls>>,
  interact: () => void,
) {
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe()
      resolve()
    })
  })
  scrollTo.mockClear()
  await act(async () => {
    interact()
    await rendered
  })
}

describe('GalleryControls keep the reader where they are', () => {
  it('does not scroll to the top when the kind changes', async () => {
    const router = await renderControls('/')

    await afterNavigation(router, () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Mods' }))
    })

    expect(router.state.location.search).toEqual({ kind: 'mods' })
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not scroll to the top when the sort changes', async () => {
    const router = await renderControls('/')

    await afterNavigation(router, () => {
      fireEvent.click(screen.getByRole('radio', { name: 'New' }))
    })

    expect(router.state.location.search).toEqual({ sort: 'new' })
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not scroll to the top when the tag filter is cleared', async () => {
    const router = await renderControls('/?tags=bash')

    await afterNavigation(router, () => {
      fireEvent.click(screen.getByRole('link', { name: 'Clear filters' }))
    })

    expect(router.state.location.search).toEqual({})
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
