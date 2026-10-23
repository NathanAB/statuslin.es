// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeGalleryEntry } from '@/gallery/gallery-items'

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}))

const { HomeGallery } = await import('@/home/home-gallery')
const { galleryView } = await import('@/gallery/gallery-items')
const { SEARCH_DEBOUNCE_MS } = await import('@/gallery/gallery-search')
const { PAGE_SIZE } = await import('@/gallery/queries')
const { Route: HomeRoute } = await import('@/routes/index')

/** The home route's search, whose own rules and loader deps the test router uses. */
type HomeSearch = (typeof HomeRoute)['types']['searchSchema']

function entry(title: string): HomeGalleryEntry {
  const slug = title.toLowerCase().replace(' ', '-')
  return {
    item: {
      kind: 'status-line',
      card: {
        configId: slug,
        slug,
        title,
        description: '',
        interpreter: 'bash',
        copyCount: 0,
        author: null,
        preview: null,
        networkHosts: [],
        readsClaudeToken: false,
        tags: [],
      },
    },
    searchText: title.toLowerCase(),
  }
}

// Two pages, so the pager shows.
const ENTRIES = [
  ...Array.from({ length: PAGE_SIZE }, (_, i) => entry(`Weather ${i}`)),
  ...Array.from({ length: PAGE_SIZE }, (_, i) => entry(`Git ${i}`)),
]

// The browser's View Transitions API: it runs the update, as a browser does, and counts each call.
const startViewTransition = vi.fn((update: () => unknown) => {
  const done = Promise.resolve(update()).then(() => undefined)
  return { updateCallbackDone: done, ready: done, finished: done, skipTransition: vi.fn() }
})

beforeEach(() => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  startViewTransition.mockClear()
  Object.defineProperty(document, 'startViewTransition', {
    value: startViewTransition,
    configurable: true,
    writable: true,
  })
})
afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'startViewTransition')
})

/** A real router whose "/" has the home route's search and shows the home page's gallery. */
async function renderGallery(initialUrl: string) {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: HomeRoute.options.validateSearch as (
      search: Record<string, unknown>,
    ) => HomeSearch,
    loaderDeps: HomeRoute.options.loaderDeps as (opts: { search: HomeSearch }) => object,
    loader: async () => ({ entries: ENTRIES }),
    component: function Home() {
      const { entries } = homeRoute.useLoaderData()
      const search = homeRoute.useSearch()
      const view = galleryView(entries, { page: search.page ?? 1, q: search.q })
      return (
        <HomeGallery
          items={view.items}
          page={view.page}
          pageCount={view.pageCount}
          total={view.total}
          sort={search.sort ?? 'trending'}
          rawKind={search.kind}
          tags={search.tags}
          query={search.q}
        />
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    scrollRestoration: true,
  })
  const { container } = render(<RouterProvider router={router} />)
  await screen.findByRole('searchbox', { name: 'Search status lines and mods' })
  return { router, container }
}

type Router = Awaited<ReturnType<typeof renderGallery>>['router']

/** Runs `start`, then resolves once the router has rendered the navigation it started. */
async function untilRendered(router: Router, start: () => unknown) {
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe()
      resolve()
    })
  })
  await start()
  await rendered
}

async function click(router: Router, element: HTMLElement) {
  await act(() => untilRendered(router, () => fireEvent.click(element)))
}

describe('the home gallery moves its rows when the list changes', () => {
  it('starts one view transition once typing in the search pauses, and none before', async () => {
    const { router } = await renderGallery('/')
    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search status lines and mods' }), {
      target: { value: 'weather' },
    })
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1))
    expect(startViewTransition).not.toHaveBeenCalled()

    await act(() => untilRendered(router, () => vi.advanceTimersByTimeAsync(1)))
    expect(router.state.location.search).toEqual({ q: 'weather' })
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('starts one when the sort changes', async () => {
    const { router } = await renderGallery('/')

    await click(router, screen.getByRole('radio', { name: 'New' }))

    expect(router.state.location.search).toEqual({ sort: 'new' })
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('starts one when the search is cleared', async () => {
    const { router } = await renderGallery('/?q=nothing-like-this')

    await click(router, screen.getByRole('link', { name: 'Clear search' }))

    expect(router.state.location.search).toEqual({})
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('starts one when the filters are cleared', async () => {
    const { router } = await renderGallery('/?tags=git')

    await click(router, screen.getByRole('link', { name: 'Clear filters' }))

    expect(router.state.location.search).toEqual({})
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  // Paging glides the window to the gallery; a view transition would fight that scroll.
  it('starts none on the next page', async () => {
    const { router } = await renderGallery('/')

    await click(router, screen.getAllByRole('link', { name: 'Next page' })[0] as HTMLElement)

    expect(router.state.location.search).toEqual({ page: 2 })
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('names each row for the transition, so a row that stays slides to its new place', async () => {
    const { container } = await renderGallery('/')

    const rows = [...container.querySelectorAll('[data-slot=gallery-row]')]
    expect(rows).toHaveLength(PAGE_SIZE)
    for (const row of rows) {
      expect(row.closest('[class*="view-transition-name:match-element"]')).toBeTruthy()
      expect(row.closest('[class*="view-transition-class:gallery-row"]')).toBeTruthy()
    }
  })
})
