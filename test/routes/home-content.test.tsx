// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
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
  PageShell: ({ children, footerNote }: { children: ReactNode; footerNote?: ReactNode }) => (
    <>
      <main>{children}</main>
      <footer>
        <p>{footerNote}</p>
      </footer>
    </>
  ),
}))
vi.mock('@/gallery/gallery-controls', () => ({
  GalleryControls: () => null,
}))
vi.mock('@/ui/submit-cta', () => ({
  SubmitChooser: () => <p>submit chooser</p>,
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
  desktopShot: { src: `/shots/${slug}.png`, width: 784, height: 142 },
})

const heroLine: HeroLine = {
  configId: 'id-panel',
  slug: 'panel',
  title: 'Dreambase Panel',
  copyCount: 223,
  author: null,
  networkHosts: [],
  readsClaudeToken: false,
  renders: { 'clean-main': [{ text: 'panel clean' }] },
}

function renderHome(
  overrides: Partial<typeof gallery> = {},
  search: Record<string, string> = {},
  featured: GalleryModCard | null = null,
  others: GalleryModCard[] = [],
) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    gallery: { ...gallery, ...overrides },
    showcase: { hero: [heroLine], mods: { featured, others } },
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
      '32 status lines and 9 mods, installed 148 times as of Sep 8, 2026.',
    )
  })

  it('leaves mods out of the count while none is published', () => {
    renderHome({ mods: 0 })

    expect(inventoryNote()?.textContent).toBe(
      '32 status lines, installed 148 times as of Sep 8, 2026.',
    )
  })

  it("makes the hero's title the only h1 on the page", () => {
    const { container } = renderHome()

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe(HOME_HEADING)
    expect(HOME_HEADING).toBe('Claude Code status lines and mods')
  })

  // Search engines and screen readers get each page's own h1; on screen the title stays the same,
  // since the pager already says which page this is.
  it('names the page number in the h1 past page 1, without showing it', () => {
    const { container } = renderHome({ page: 2, pageCount: 3 })

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe('Claude Code status lines and mods, page 2')
    expect(h1s[0]?.querySelector('.sr-only')?.textContent).toBe(', page 2')
  })

  // The hero's title and terminal are the page's largest paint. They faded in late, holding that
  // paint back; now their entrance only moves them, so they show with the page's first paint.
  it('paints the hero title and terminal at once: their entrance moves them, never hides them', () => {
    const { container } = renderHome()
    const hero = container.querySelector('section') as HTMLElement
    const fadesIn = (element: Element | null) => {
      for (let node = element; node && node !== hero.parentElement; node = node.parentElement) {
        if (/\bfade-in-0\b/.test(node.getAttribute('class') ?? '')) return true
      }
      return false
    }

    expect(fadesIn(hero.querySelector('h1'))).toBe(false)
    expect(fadesIn(screen.getByRole('img', { name: /^Claude Code with/ }))).toBe(false)
  })

  // Past page 1 the page is its results: the showcase around them would only repeat page 1.
  it('shows only the heading and the gallery past page 1', () => {
    renderHome({ page: 2, pageCount: 3 }, {}, modCard('weather'), [modCard('deck')])

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Claude Code status lines and mods, page 2',
    )
    expect([...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim())).toEqual([
      'Status lines and mods',
    ])
    expect(screen.queryByText(/A status line is the row under your Claude Code prompt/)).toBeNull()
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
  // Each page link lands on the results (#gallery), not back at the top of the page.
  it('links the next page, keeping what the gallery shows, from page 1', () => {
    renderHome({ pageCount: 3 }, { kind: 'mods' })

    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/?page=2&kind=mods#gallery',
    )
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull()
  })

  it('links both ways from a middle page, and only back from the last', () => {
    renderHome({ page: 2, pageCount: 3 })
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe(
      '/#gallery',
    )
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/?page=3#gallery',
    )
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

describe('home sections', () => {
  const sectionHeadings = () =>
    [...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim())

  it('runs hero, gallery, mods, how installing works, then the closing invitation', () => {
    renderHome({}, {}, modCard('weather'), [modCard('deck')])

    expect(sectionHeadings()).toEqual([
      'Pick a status line',
      'Status lines and mods',
      'Mods',
      'How installing works',
      'Yours goes here.',
    ])
    expect(screen.getByText('submit chooser')).toBeTruthy()
  })

  // The featured mod leads the mods row now, below the gallery, instead of a row above it.
  it('leads the mods row with the featured mod, linking every shot to its mod', () => {
    renderHome({}, {}, modCard('weather'), [modCard('deck')])

    const row = screen.getByRole('list', { name: 'Mods in Claude Desktop' })
    expect([...row.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/mods/weather',
      '/mods/deck',
    ])
    expect(screen.getByRole('link', { name: 'All 9 mods' }).getAttribute('href')).toBe('/mods')
  })

  it('reports the featured mod with its own surface', () => {
    renderHome({}, {}, modCard('weather'))

    fireEvent.click(screen.getByRole('img', { name: 'weather running in Claude Desktop' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: 'id-weather',
      slug: 'weather',
      surface: 'home_featured_mod',
      position: 1,
    })
  })

  it('explains installing in three short steps', () => {
    renderHome()

    const install = screen.getByRole('heading', { level: 2, name: 'How installing works' })
    const steps = install.closest('section')?.querySelectorAll('h3')
    expect(steps).toHaveLength(3)
  })
})
