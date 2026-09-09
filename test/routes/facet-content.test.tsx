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
vi.mock('@/gallery/config-card', () => ({
  GalleryConfigCard: () => null,
}))

const { Route: FacetRoute } = await import('@/routes/status-lines.$facet')

describe('facet page content', () => {
  it('states the live published count from the cards on the page', () => {
    vi.spyOn(FacetRoute, 'useLoaderData').mockReturnValue({
      user: null,
      page: {
        slug: 'git',
        cards: [
          { slug: 'a', title: 'A' },
          { slug: 'b', title: 'B' },
          { slug: 'c', title: 'C' },
          { slug: 'd', title: 'D' },
        ],
        indexable: true,
        updated: '2026-09-08',
        otherFacets: [],
      },
    })
    const FacetPage = FacetRoute.options.component

    render(FacetPage ? <FacetPage /> : null)

    expect(screen.getByText(/4 published status lines/i)).toBeTruthy()
    expect(screen.queryByText(/this page lists/i)).toBeNull()
  })
})
