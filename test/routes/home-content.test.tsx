// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
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

describe('home content', () => {
  it('explains the community gallery of real submitted status lines', () => {
    vi.spyOn(HomeRoute, 'useLoaderData').mockReturnValue({
      user: null,
      gallery: {
        cards: [],
        page: 1,
        pageCount: 1,
        availableTags: [],
      },
    })
    vi.spyOn(HomeRoute, 'useSearch').mockReturnValue({})
    const Home = HomeRoute.options.component

    render(Home ? <Home /> : null)

    const intro = screen.getByText(/community gallery/i)
    expect(intro.textContent).toMatch(/Claude Code status lines/)
    expect(intro.textContent).not.toMatch(/examples/)
    expect(intro.textContent).not.toMatch(/templates/)
    expect(intro.textContent).toMatch(/previews rendered from the real script/)
    expect(intro.querySelector('a[href="/guide"]')).not.toBeNull()
  })
})
