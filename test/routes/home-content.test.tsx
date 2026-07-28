// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}))
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
  it('explains the community gallery and its real-script ready-to-copy examples', () => {
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
    expect(intro.textContent).toMatch(/Claude Code status line examples/)
    expect(intro.textContent).toMatch(/ready-to-copy templates/)
    expect(intro.textContent).toMatch(/previews rendered from the real script/)
  })
})
