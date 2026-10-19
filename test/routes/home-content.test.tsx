// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import type { HeroLine } from '@/gallery/hero-lines'
import { HOME_HEADING } from '@/lib/page-title'

const capture = vi.hoisted(() => vi.fn())
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }))

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      params,
      search,
      hash,
      children,
      ...props
    }: {
      to: string
      params?: Record<string, string>
      search?: unknown
      hash?: string
      children: React.ReactNode
    }) => {
      const path = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to
      const query =
        search && typeof search === 'object'
          ? new URLSearchParams(search as Record<string, string>).toString()
          : ''
      const href = `${query ? `${path}?${query}` : path}${hash ? `#${hash}` : ''}`
      return (
        <a href={href} {...props}>
          {children}
        </a>
      )
    },
  }
})
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/gallery/gallery-controls', () => ({
  GalleryControls: () => null,
}))
vi.mock('@/ui/submit-cta', () => ({
  SubmitCta: () => null,
}))
// It fetches the script it would install; the hero's own tests cover it.
vi.mock('@/adopt/install-prompt-button', () => ({
  InstallPromptButton: () => null,
}))

const { Route: HomeRoute } = await import('@/routes/index')

const gallery = {
  items: [],
  page: 1,
  pageCount: 1,
  statusLines: 32,
  mods: 9,
  copyCount: 148,
  asOf: '2026-09-08',
}

const modCard = (slug: string): GalleryModCard => ({
  modId: `id-${slug}`,
  slug,
  title: slug,
  description: '',
  authorGithub: 'octocat',
  copyCount: 0,
  tags: [],
  preview: null,
  desktopShot: null,
})

const heroLine: HeroLine = {
  configId: 'id-panel',
  slug: 'panel',
  title: 'Dreambase Panel',
  copyCount: 223,
  author: null,
  renders: { 'clean-main': [{ text: 'panel clean' }] },
}

function renderHome(
  overrides: Partial<typeof gallery> = {},
  search: Record<string, string> = {},
  featuredMod: GalleryModCard | null = null,
) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    gallery: { ...gallery, ...overrides },
    hero: [heroLine],
    featuredMod,
  })
  vi.spyOn(HomeRoute, 'useSearch').mockReturnValue(search)
  const Home = HomeRoute.options.component
  return render(Home ? <Home /> : null)
}

/** The dated count paragraph: the one holding a <time>. */
const inventoryNote = () => document.querySelector('time')?.closest('p')

describe('home content', () => {
  it('counts both kinds, their copies and the as-of date it is given', () => {
    renderHome()

    expect(inventoryNote()?.textContent).toBe(
      '32 status lines and 9 mods, copied 148 times as of Sep 8, 2026.',
    )
  })

  it('leaves mods out of the count while none is published', () => {
    renderHome({ mods: 0 })

    expect(inventoryNote()?.textContent).toBe(
      '32 status lines, copied 148 times as of Sep 8, 2026.',
    )
  })

  it("makes the hero's title the only h1 on the page", () => {
    const { container } = renderHome()

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe(HOME_HEADING)
    expect(HOME_HEADING).toBe('Claude Code status lines and mods')
  })

  it('names the page number in the h1 past page 1', () => {
    const { container } = renderHome({ page: 2, pageCount: 3 })

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe('Claude Code status lines and mods, page 2')
  })

  // The hero is the first thing on the page, and the server renders its first state.
  it('opens with the hero: the title, its sentence and the top status line running', () => {
    const { container } = renderHome()

    const first = container.querySelector('section')
    expect(first?.querySelector('h1')?.textContent).toBe(HOME_HEADING)
    expect(first?.textContent).toContain('A status line is the row under your Claude Code prompt.')
    expect(first?.textContent).toContain('panel clean')
    expect(first?.textContent).not.toMatch(/32 status lines/)
    expect(screen.queryByText('Browse by feature')).toBeNull()
  })
})

describe('home pagination', () => {
  it('links the next page, keeping what the gallery shows, from page 1', () => {
    renderHome({ pageCount: 3 }, { kind: 'mods' })

    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/?page=2&kind=mods',
    )
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull()
  })

  it('links both ways from a middle page, and only back from the last', () => {
    renderHome({ page: 2, pageCount: 3 })
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/?page=3')
  })

  it('shows no pager on a single page', () => {
    renderHome()
    expect(screen.queryByText(/Page 1 of/)).toBeNull()
  })
})

describe('home analytics', () => {
  it('captures paging with what the gallery shows', () => {
    renderHome({ pageCount: 2 }, { kind: 'mods' })

    fireEvent.click(screen.getByRole('link', { name: 'Next page' }))

    expect(capture).toHaveBeenCalledWith('gallery_page_changed', {
      page: 2,
      sort: 'trending',
      selectedTags: [],
      kind: 'mods',
    })
  })
})

describe('home "Featured mod" row', () => {
  const featured = modCard('context-bar')
  const row = () =>
    screen
      .getByRole('heading', { level: 2, name: 'Featured mod' })
      .closest('section') as HTMLElement

  // The row sits right above the gallery's filter, so its link switches that filter to mods
  // instead of leaving for /mods, and scrolls down to the list.
  it('shows the one mod it is given above the gallery, with a link that filters it to mods', () => {
    renderHome({}, {}, featured)

    const inRow = within(row())
    const link = inRow.getByRole('link', { name: 'Browse all mods' })
    expect(link.getAttribute('href')).toBe('/?kind=mods#gallery')
    const target = document.getElementById('gallery')
    expect(target?.contains(screen.getByRole('heading', { name: 'Status lines and mods' }))).toBe(
      true,
    )
    expect(inRow.getByRole('link', { name: 'context-bar' }).getAttribute('href')).toBe(
      '/mods/context-bar',
    )
    expect(row().querySelectorAll('[data-slot="gallery-row"]')).toHaveLength(1)
    const galleryHeading = screen.getByRole('heading', { name: 'Status lines and mods' })
    expect(
      row().compareDocumentPosition(galleryHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('is left out when there is no featured mod', () => {
    renderHome()

    expect(screen.queryByRole('heading', { name: 'Featured mod' })).toBeNull()
  })

  it('reports a card click with the row as its surface', () => {
    renderHome({}, {}, featured)

    fireEvent.click(screen.getByRole('link', { name: 'context-bar' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: 'id-context-bar',
      slug: 'context-bar',
      surface: 'home_featured_mod',
      position: 1,
    })
  })
})
