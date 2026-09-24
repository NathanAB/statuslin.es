// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HOME_HEADING } from '@/lib/page-title'

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
  cards: [],
  page: 1,
  pageCount: 1,
  availableTags: [],
  publishedCount: 32,
  copyCount: 148,
  asOf: '2026-09-08',
  facets: [
    { slug: 'git', chipLabel: 'git' },
    { slug: 'quota', chipLabel: 'limits' },
  ],
}

function renderHome(overrides: Partial<typeof gallery> = {}) {
  vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
    user: null,
    gallery: { ...gallery, ...overrides },
  })
  vi.spyOn(HomeRoute, 'useSearch').mockReturnValue({})
  const Home = HomeRoute.options.component
  return render(Home ? <Home /> : null)
}

describe('home content', () => {
  it('explains the reviewed community gallery of real submitted status lines', () => {
    renderHome()

    const page = document.body.textContent ?? ''
    expect(page).toContain(
      "Community-submitted and reviewed by hand. Every card shows the real script's output.",
    )
    expect(page).not.toMatch(/examples/)
    expect(page).not.toMatch(/templates/)
    expect(page).toMatch(/not a TUI installer/)
    expect(page).toMatch(/32 published/)
    expect(page).toMatch(/148/)
    expect(page).toMatch(/Sep 8, 2026/)
    expect(screen.getByRole('link', { name: 'Git' }).getAttribute('href')).toBe('/status-lines/git')
    expect(screen.getByRole('link', { name: 'Limits' }).getAttribute('href')).toBe(
      '/status-lines/quota',
    )
  })

  it('makes the gallery heading the only h1 on the page', () => {
    const { container } = renderHome()

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe(HOME_HEADING)
    expect(HOME_HEADING).toBe('A gallery of Claude Code status lines')
  })

  it('names the page number in the h1 past page 1', () => {
    const { container } = renderHome({ page: 2, pageCount: 3 })

    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe('A gallery of Claude Code status lines, page 2')
  })

  it('sits the heading beside the wordmark, with browse-by-feature in a full-width row below', () => {
    const { container } = renderHome()

    const masthead = container.querySelector('h1')?.parentElement?.parentElement
    expect(masthead?.className).toContain('sm:grid-cols-2')
    expect(masthead?.textContent).toMatch(/statuslin\.es/)
    expect(masthead?.textContent).not.toMatch(/TUI installer/)
    expect(masthead?.textContent).not.toMatch(/32 published/)
    const browse = screen.getByText('Browse by feature')
    expect(browse.tagName).toBe('SPAN')
    expect(masthead?.contains(browse)).toBe(false)
    expect(masthead?.nextElementSibling?.contains(browse)).toBe(true)
    expect(browse.parentElement?.contains(screen.getByRole('link', { name: 'Git' }))).toBe(true)
  })

  it('centers the dated inventory note on two lines under the gallery', () => {
    renderHome()

    const inventory = screen.getByText(/32 published status lines/)
    const disambiguation = screen.getByText(/not a TUI installer/)
    expect(inventory.tagName).toBe('P')
    expect(disambiguation.tagName).toBe('P')
    expect(inventory).not.toBe(disambiguation)
    expect(inventory.className).toContain('text-center')
    expect(disambiguation.className).toContain('text-center')
  })
})
