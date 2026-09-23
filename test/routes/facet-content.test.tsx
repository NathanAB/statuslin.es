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

function renderFacet(slug: string) {
  vi.spyOn(FacetRoute, 'useLoaderData').mockReturnValue({
    user: null,
    page: {
      slug,
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
  return render(FacetPage ? <FacetPage /> : null)
}

describe('facet page content', () => {
  it('states the live published count from the cards on the page', () => {
    renderFacet('git')

    expect(screen.getByText(/4 published status lines/i)).toBeTruthy()
    expect(screen.queryByText(/this page lists/i)).toBeNull()
  })

  it('answers the how-to question and shows common questions on answered facets', () => {
    renderFacet('token-usage')

    const answer = [...document.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('Token usage is under context_window.'),
    )
    expect(answer?.querySelector('.font-mono')?.textContent).toBe('context_window')
    expect(screen.getByRole('heading', { level: 2, name: 'Common questions' })).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Why does my token count show null?' }),
    ).toBeTruthy()
  })

  it('shows no common questions on facets without an FAQ', () => {
    renderFacet('cost')

    expect(screen.queryByRole('heading', { name: 'Common questions' })).toBeNull()
  })

  it('emits FAQPage JSON-LD only for facets with an FAQ', async () => {
    const headFor = async (slug: string) => {
      const head = await FacetRoute.options.head?.({
        loaderData: {
          user: null,
          page: { slug, cards: [], indexable: true, updated: null, otherFacets: [] },
        },
      } as never)
      return ((head?.scripts ?? []) as Array<{ children: string }>).map(
        (script) => JSON.parse(script.children) as Record<string, unknown>,
      )
    }

    const faqPage = (await headFor('quota')).find((node) => node['@type'] === 'FAQPage')
    expect((faqPage?.mainEntity as Array<{ name: string }>).map((q) => q.name)).toEqual([
      'Why is rate_limits missing from my status line input?',
      'How do I show when my limit resets?',
      'What is the difference between five_hour and seven_day?',
    ])
    expect((await headFor('cost')).map((node) => node['@type'])).toEqual([
      'CollectionPage',
      'BreadcrumbList',
    ])
  })

  it('shows the date the newest status line in the facet was updated', () => {
    renderFacet('git')

    expect(screen.getByText('Updated 2026-09-08')).toBeTruthy()
  })
})
