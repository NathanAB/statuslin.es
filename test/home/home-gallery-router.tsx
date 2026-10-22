import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { galleryView, type HomeGalleryEntry } from '@/gallery/gallery-items'
import { SEARCH_DEBOUNCE_MS } from '@/gallery/gallery-search'
import { PAGE_SIZE } from '@/gallery/queries'
import { HomeGallery } from '@/home/home-gallery'
import { Route as HomeRoute } from '@/routes/index'

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

// Three pages in all; the weather lines fill two pages of their own.
export const WEATHER = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => entry(`Weather ${i}`))
export const ENTRIES = [
  ...WEATHER,
  ...Array.from({ length: PAGE_SIZE }, (_, i) => entry(`Git ${i}`)),
]

/**
 * A real router whose "/" has the home route's search and loader deps, loads every entry and shows
 * the gallery the home page shows for its URL. Several URLs make a history, the last one current.
 */
export async function renderGallery(...urls: string[]) {
  const loader = vi.fn(async () => ({ entries: ENTRIES }))
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: HomeRoute.options.validateSearch as (
      search: Record<string, unknown>,
    ) => HomeSearch,
    loaderDeps: HomeRoute.options.loaderDeps as (opts: { search: HomeSearch }) => object,
    loader,
    component: function Home() {
      const { entries } = homeRoute.useLoaderData()
      const search = homeRoute.useSearch()
      const view = galleryView(entries, { page: search.page ?? 1, q: search.q })
      return (
        <HomeGallery
          items={view.items}
          page={view.page}
          pageCount={view.pageCount}
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
    history: createMemoryHistory({ initialEntries: urls, initialIndex: urls.length - 1 }),
    scrollRestoration: true,
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('searchbox', { name: 'Search status lines and mods' })
  return { router, loader }
}

export type Router = Awaited<ReturnType<typeof renderGallery>>['router']

/** Runs `start`, then resolves once the router has rendered the navigation it started. */
export async function untilRendered(router: Router, start: () => unknown) {
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe()
      resolve()
    })
  })
  await start()
  await rendered
}

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search status lines and mods' })
export const titles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)
export const pageLabels = () =>
  screen
    .queryAllByRole('navigation', { name: 'Gallery pages' })
    .map((pager) => within(pager).getByText(/^Page \d+ of \d+$/).textContent)

export async function typeAndWait(router: Router, text: string) {
  fireEvent.change(searchBox(), { target: { value: text } })
  await act(() => untilRendered(router, () => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)))
}
