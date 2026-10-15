// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
  publishedCount: 32,
  copyCount: 148,
  asOf: '2026-09-08',
}

function renderHome(overrides: Partial<typeof gallery> = {}, search: Record<string, string> = {}) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    gallery: { ...gallery, ...overrides },
  })
  vi.spyOn(HomeRoute, 'useSearch').mockReturnValue(search)
  const Home = HomeRoute.options.component
  return render(Home ? <Home /> : null)
}

describe('home content', () => {
  it('shows the published count, copy count and as-of date it is given', () => {
    renderHome()

    const page = document.body.textContent ?? ''
    expect(page).toMatch(/32 published/)
    expect(page).toMatch(/148/)
    expect(page).toMatch(/Sep 8, 2026/)
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
    expect(masthead?.textContent).not.toMatch(/32 published/)
    expect(screen.queryByText('Browse by feature')).toBeNull()
  })

  it('centers the dated inventory note under the gallery', () => {
    renderHome()

    const inventory = screen.getByText(/32 published status lines/)
    expect(inventory.tagName).toBe('P')
    expect(inventory.className).toContain('text-center')
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
