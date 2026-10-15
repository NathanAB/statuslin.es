// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
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
      children,
      ...props
    }: {
      to: string
      params?: Record<string, string>
      children: React.ReactNode
    }) => {
      const href = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to
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

function renderHome(
  overrides: Partial<typeof gallery> = {},
  search: Record<string, string> = {},
  newMods: GalleryModCard[] = [],
) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    gallery: { ...gallery, ...overrides },
    newMods,
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

  it('makes the gallery heading the only h1 on the page', () => {
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

  it('sits the heading beside the wordmark, with no browse-by-feature row', () => {
    const { container } = renderHome()

    const masthead = container.querySelector('h1')?.parentElement?.parentElement
    expect(masthead?.className).toContain('sm:grid-cols-2')
    expect(masthead?.textContent).toMatch(/statuslin\.es/)
    expect(masthead?.textContent).not.toMatch(/32 status lines/)
    expect(screen.queryByText('Browse by feature')).toBeNull()
  })

  it('centers the dated inventory note under the gallery', () => {
    renderHome()

    expect(inventoryNote()?.className).toContain('text-center')
  })
})

describe('home analytics', () => {
  it('captures paging with what the gallery shows', () => {
    renderHome({ pageCount: 2 }, { kind: 'mods' })

    fireEvent.click(screen.getByRole('link', { name: 'Next →' }))

    expect(capture).toHaveBeenCalledWith('gallery_page_changed', {
      page: 2,
      sort: 'trending',
      selectedTags: [],
      kind: 'mods',
    })
  })
})

describe('home "New mods" row', () => {
  const newMods = [modCard('newest-mod'), modCard('older-mod')]

  it('shows the mods it is given, in order, above the gallery, with a link to all mods', () => {
    renderHome({}, {}, newMods)

    const row = screen
      .getByRole('heading', { level: 2, name: 'New mods' })
      .closest('section') as HTMLElement
    const inRow = within(row)
    expect(inRow.getByRole('link', { name: 'Browse all mods' }).getAttribute('href')).toBe('/mods')
    const cardLinks = inRow
      .getAllByRole('link', { name: /-mod$/ })
      .map((a) => [a.textContent, a.getAttribute('href')])
    expect(cardLinks).toEqual([
      ['newest-mod', '/mods/newest-mod'],
      ['older-mod', '/mods/older-mod'],
    ])
    const galleryHeading = screen.getByRole('heading', { name: 'Status lines and mods' })
    expect(
      row.compareDocumentPosition(galleryHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('stacks its cards full width in one column, like the mods page', () => {
    renderHome({}, {}, newMods)

    const row = screen
      .getByRole('heading', { level: 2, name: 'New mods' })
      .closest('section') as HTMLElement
    const cards = row.querySelectorAll('[data-slot="card"]')
    expect(cards).toHaveLength(2)
    const column = cards[0]?.parentElement
    expect(column).toBe(cards[1]?.parentElement)
    expect(column?.className).toContain('flex-col')
    expect(column?.className).not.toContain('grid-cols')
  })

  it('is left out when there are no mods to show', () => {
    renderHome()

    expect(screen.queryByRole('heading', { name: 'New mods' })).toBeNull()
  })

  it('reports a card click with the row as its surface', () => {
    renderHome({}, {}, newMods)

    fireEvent.click(screen.getByRole('link', { name: 'older-mod' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: 'id-older-mod',
      slug: 'older-mod',
      surface: 'home_new_mods',
      position: 2,
    })
  })
})
