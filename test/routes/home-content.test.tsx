// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { HomeGalleryEntry } from '@/gallery/gallery-items'
import type { HeroLine } from '@/gallery/hero-lines'
import { PAGE_SIZE } from '@/gallery/queries'
import { HOME_HERO_HEADING } from '@/lib/page-title'

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
  PageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/gallery/gallery-controls', () => ({
  GalleryControls: () => null,
}))
// It fetches the script it would install; the hero's own tests cover it.
vi.mock('@/adopt/install-prompt-button', () => ({
  InstallPromptButton: () => null,
}))

const { Route: HomeRoute } = await import('@/routes/index')

/** Loader entries that fill `pages` gallery pages: none for one page, else one onto the last. */
function entries(pages: number): HomeGalleryEntry[] {
  return Array.from({ length: pages > 1 ? (pages - 1) * PAGE_SIZE + 1 : 0 }, (_, i) => ({
    item: {
      kind: 'status-line',
      card: {
        configId: `id-${i}`,
        slug: `line-${i}`,
        title: `Line ${i}`,
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
    searchText: `line ${i}`,
  }))
}

const heroLine: HeroLine = {
  configId: 'id-panel',
  versionId: 'version-panel',
  slug: 'panel',
  title: 'Dreambase Panel',
  copyCount: 223,
  author: null,
  networkHosts: [],
  readsClaudeToken: false,
  render: [{ text: 'panel clean' }],
  desktop: null,
  sortKey: 1,
}

function renderHome(pages = 1, search: Record<string, string | number> = {}) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    entries: entries(pages),
    showcase: { hero: [{ kind: 'status-line', line: heroLine }] },
  })
  vi.spyOn(HomeRoute, 'useSearch').mockReturnValue(search)
  const Home = HomeRoute.options.component
  return render(Home ? <Home /> : null)
}

describe('home content', () => {
  // The hero's one line about review grew into its own section: the four checks every listing
  // passes, on its own band of colour after the gallery, with a link to the page that shows each one.
  it('says how listings are checked after the gallery, and links to the steps', () => {
    renderHome()

    const checks = screen.getByRole('region', { name: 'How listings are checked' })
    expect(
      within(checks)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Pinned to one version',
      'Run in a sandbox',
      "Reviewed before it's listed",
      'Listed with what it can reach',
    ])
    expect(within(checks).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe(
      '/how-it-works',
    )
    // The checks are code anyone can read.
    expect(within(checks).getByText(/statuslin\.es is open source/)).toBeTruthy()
    expect(within(checks).getByRole('link', { name: 'read on GitHub' }).getAttribute('href')).toBe(
      'https://github.com/NathanAB/statuslin.es',
    )
    const hero = screen.getByRole('heading', { level: 1 })
    const gallery = screen.getByRole('heading', { level: 2, name: 'Status lines and mods' })
    expect(hero.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(gallery.compareDocumentPosition(checks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The owner dropped the footer's inventory line ("N status lines and M mods, installed …").
  it('puts no inventory line in the footer', () => {
    renderHome()

    expect(document.body.textContent).not.toMatch(/installed \d+ times/)
    expect(document.querySelector('time')).toBeNull()
  })

  it("makes the hero's title the only h1 on the page", () => {
    const { container } = renderHome()

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe(HOME_HERO_HEADING)
    expect(HOME_HERO_HEADING).toBe('Customize Claude Code with mods')
  })

  // Search engines and screen readers get each page's own h1; on screen the title stays the same,
  // since the pager already says which page this is.
  it('names the page number in the h1 past page 1, without showing it', () => {
    const { container } = renderHome(3, { page: 2 })

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe(`${HOME_HERO_HEADING}, page 2`)
    expect(h1s[0]?.querySelector('.sr-only')?.textContent).toBe(', page 2')
  })

  // Sliding up without a fade read as nonsensical next to the picker fading in: every part of the
  // hero fades as it rises, as the prototype does.
  it('fades the hero title and terminal in as they rise, like the rest of the hero', () => {
    const { container } = renderHome()
    const hero = container.querySelector('section') as HTMLElement
    const fadesIn = (element: Element | null) => {
      for (let node = element; node && node !== hero.parentElement; node = node.parentElement) {
        if (/\bfade-in-1\b/.test(node.getAttribute('class') ?? '')) return true
      }
      return false
    }

    expect(fadesIn(hero.querySelector('h1'))).toBe(true)
    expect(fadesIn(screen.getByRole('img', { name: /^Claude Code with/ }))).toBe(true)
  })

  // Paging changes only the list: the hero stays, so the page keeps its shape and the page link
  // lands on the gallery.
  it('keeps the hero on every page, so paging only changes the list', () => {
    renderHome(3, { page: 2 })

    expect(screen.getByText('Pick a mod and see it in action.')).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Pick a mod' })).toBeTruthy()
  })

  // The hero is the first thing on the page, and the server renders its first state.
  it('opens with the hero: the title, its sentence and the top status line running', () => {
    const { container } = renderHome()

    const first = container.querySelector('section')
    expect(first?.querySelector('h1')?.textContent).toBe(HOME_HERO_HEADING)
    expect(first?.textContent).toContain(
      'Track your usage limits, context window, git branch and more.',
    )
    expect(first?.textContent).toContain('panel clean')
    // Read in order: the title, then its sentence right under it, then the demo.
    const lead = first?.querySelector('h1')?.parentElement?.nextElementSibling
    expect(lead?.textContent).toBe(
      'Track your usage limits, context window, git branch and more. Pick a mod and see it in action.',
    )
    // One line per sentence: what mods do, then the invitation.
    expect([...(lead?.children ?? [])].map((line) => line.textContent)).toEqual([
      'Track your usage limits, context window, git branch and more.',
      'Pick a mod and see it in action.',
    ])
    expect(first?.textContent).not.toMatch(/32 status lines/)
    expect(screen.queryByText('Browse by feature')).toBeNull()
  })
})

describe('home pagination', () => {
  const pagers = () => screen.getAllByRole('navigation', { name: /^Gallery pages/ })

  // The same pager sits above the list, beside the sort, and under it.
  it('puts the same pager above the list and under it', () => {
    renderHome(3)
    expect(pagers()).toHaveLength(2)
    for (const pager of pagers()) {
      expect(within(pager).getByText('Page 1 of 3')).toBeTruthy()
      expect(within(pager).getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
        '/?page=2#gallery',
      )
    }
  })

  // Each page link lands on the results (#gallery), not back at the top of the page.
  it('links the next page, keeping what the gallery shows, from page 1', () => {
    renderHome(3, { kind: 'mods' })
    const [, bottom] = pagers()

    expect(
      within(bottom as HTMLElement)
        .getByRole('link', { name: 'Next page' })
        .getAttribute('href'),
    ).toBe('/?page=2&kind=mods#gallery')
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull()
  })

  it('links both ways from a middle page, and only back from the last', () => {
    renderHome(3, { page: 2 })
    const [, bottom] = pagers()
    const link = (name: string) =>
      within(bottom as HTMLElement)
        .getByRole('link', { name })
        .getAttribute('href')
    expect(link('Previous page')).toBe('/#gallery')
    expect(link('Next page')).toBe('/?page=3#gallery')
  })

  it('shows no pager on a single page', () => {
    renderHome()
    expect(screen.queryByText(/Page 1 of/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: /^Gallery pages/ })).toBeNull()
  })
})

describe('home analytics', () => {
  it('captures paging with what the gallery shows', () => {
    renderHome(2, { kind: 'mods' })

    fireEvent.click(screen.getAllByRole('link', { name: 'Next page' })[0] as HTMLElement)

    expect(capture).toHaveBeenCalledWith('gallery_page_changed', {
      page: 2,
      sort: 'trending',
      selectedTags: [],
      kind: 'mods',
    })
  })
})

describe('home sections', () => {
  // The gallery is the page: nothing below it repeats the hero or the header.
  it('runs the hero, the gallery, then how listings are checked, and ends there', () => {
    renderHome()

    expect([...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim())).toEqual([
      'Status lines and mods',
      'How listings are checked',
    ])
    // The sentence already says "Pick a mod", so the list keeps the words only as its name for
    // screen readers, with no heading on screen.
    expect(screen.queryByRole('heading', { name: 'Pick a mod' })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Pick a mod' })).toBeTruthy()
  })
})
