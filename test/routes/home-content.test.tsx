// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { HeroLine } from '@/gallery/hero-lines'
import { HOME_HEADING, HOME_HERO_HEADING } from '@/lib/page-title'

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

const gallery = {
  items: [],
  page: 1,
  pageCount: 1,
}

const heroLine: HeroLine = {
  configId: 'id-panel',
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

function renderHome(overrides: Partial<typeof gallery> = {}, search: Record<string, string> = {}) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    gallery: { ...gallery, ...overrides },
    showcase: { hero: [{ kind: 'status-line', line: heroLine }] },
  })
  vi.spyOn(HomeRoute, 'useSearch').mockReturnValue(search)
  const Home = HomeRoute.options.component
  return render(Home ? <Home /> : null)
}

describe('home content', () => {
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
  // Past page 1 the h1 names the list, not the hero's invitation.
  it('names the page number in the h1 past page 1, without showing it', () => {
    const { container } = renderHome({ page: 2, pageCount: 3 })

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe(`${HOME_HEADING}, page 2`)
    expect(HOME_HEADING).toBe('Claude Code mods')
    expect(h1s[0]?.querySelector('.sr-only')?.textContent).toBe(', page 2')
  })

  // Sliding up without a fade read as nonsensical next to the picker fading in: every part of the
  // hero fades as it rises, as the prototype does.
  it('fades the hero title and terminal in as they rise, like the rest of the hero', () => {
    const { container } = renderHome()
    const hero = container.querySelector('section') as HTMLElement
    const fadesIn = (element: Element | null) => {
      for (let node = element; node && node !== hero.parentElement; node = node.parentElement) {
        if (/\bfade-in-0\b/.test(node.getAttribute('class') ?? '')) return true
      }
      return false
    }

    expect(fadesIn(hero.querySelector('h1'))).toBe(true)
    expect(fadesIn(screen.getByRole('img', { name: /^Claude Code with/ }))).toBe(true)
  })

  // Past page 1 the page is its results: the hero would only repeat page 1.
  it('shows only the heading and the gallery past page 1', () => {
    renderHome({ page: 2, pageCount: 3 })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Claude Code mods, page 2')
    expect([...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim())).toEqual([
      'Status lines and mods',
    ])
    expect(screen.queryByText(/Pick one and see it in action/)).toBeNull()
  })

  // The hero is the first thing on the page, and the server renders its first state.
  it('opens with the hero: the title, its sentence and the top status line running', () => {
    const { container } = renderHome()

    const first = container.querySelector('section')
    expect(first?.querySelector('h1')?.textContent).toBe(HOME_HERO_HEADING)
    expect(first?.textContent).toContain(
      'Status lines and mods that track your usage limits, context window and git branch.',
    )
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
  // The gallery is the page: nothing below it repeats the hero or the header.
  it('runs the hero, then the gallery, and ends there', () => {
    renderHome()

    expect([...document.querySelectorAll('main h2')].map((h) => h.textContent?.trim())).toEqual([
      'Pick a mod',
      'Status lines and mods',
    ])
  })
})
