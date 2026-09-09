// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

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

describe('home content', () => {
  it('explains the community gallery of real submitted status lines', () => {
    vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
      user: null,
      gallery,
    })
    vi.spyOn(HomeRoute, 'useSearch').mockReturnValue({})
    const Home = HomeRoute.options.component

    render(Home ? <Home /> : null)

    const page = document.body.textContent ?? ''
    expect(page).toMatch(/community gallery/i)
    expect(page).toMatch(/Claude Code status lines/)
    expect(page).not.toMatch(/examples/)
    expect(page).not.toMatch(/templates/)
    expect(page).toMatch(/sandbox/)
    expect(page).toMatch(/reviewed/)
    expect(page).toMatch(/not a TUI installer/)
    expect(page).toMatch(/32 published/)
    expect(page).toMatch(/148/)
    expect(page).toMatch(/Sep 8, 2026/)
    expect(screen.getByRole('heading', { name: 'Browse by feature:' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Git' }).getAttribute('href')).toBe('/status-lines/git')
    expect(screen.getByRole('link', { name: 'Limits' }).getAttribute('href')).toBe(
      '/status-lines/quota',
    )
    expect(screen.getByRole('link', { name: /setup guide/i })).not.toBeNull()
  })

  it('puts the setup guide invitation on its own line', () => {
    vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
      user: null,
      gallery,
    })
    vi.spyOn(HomeRoute, 'useSearch').mockReturnValue({})
    const Home = HomeRoute.options.component

    render(Home ? <Home /> : null)
    const intro = screen.getByText(/community gallery of reviewed/i)
    const setup = screen.getByText(/to wire one up yourself/i)
    expect(intro.tagName).toBe('P')
    expect(setup.tagName).toBe('P')
    expect(setup).not.toBe(intro)
  })

  it('sits the title beside the identity copy, with browse-by-feature in a full-width row below', () => {
    vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
      user: null,
      gallery,
    })
    vi.spyOn(HomeRoute, 'useSearch').mockReturnValue({})
    const Home = HomeRoute.options.component

    const { container } = render(Home ? <Home /> : null)
    const h1 = container.querySelector('h1')
    const masthead = h1?.parentElement
    expect(masthead?.className).toContain('sm:grid-cols-2')
    expect(masthead?.textContent).toMatch(/community gallery/)
    expect(masthead?.textContent).not.toMatch(/TUI installer/)
    expect(masthead?.textContent).not.toMatch(/32 published/)
    const browse = screen.getByRole('heading', { name: 'Browse by feature:' })
    expect(masthead?.contains(browse)).toBe(false)
    expect(masthead?.nextElementSibling?.contains(browse)).toBe(true)
    expect(browse.parentElement?.className.split(/\s+/)).toContain('flex')
    expect(browse.parentElement?.className).not.toContain('flex-col')
    expect(browse.parentElement?.contains(screen.getByRole('link', { name: 'Git' }))).toBe(true)
  })

  it('centers the dated inventory note on two lines under the gallery', () => {
    vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
      user: null,
      gallery,
    })
    vi.spyOn(HomeRoute, 'useSearch').mockReturnValue({})
    const Home = HomeRoute.options.component

    render(Home ? <Home /> : null)
    const inventory = screen.getByText(/32 published status lines/)
    const disambiguation = screen.getByText(/not a TUI installer/)
    expect(inventory.tagName).toBe('P')
    expect(disambiguation.tagName).toBe('P')
    expect(inventory).not.toBe(disambiguation)
    expect(inventory.className).toContain('text-center')
    expect(disambiguation.className).toContain('text-center')
  })
})
