// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
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
      activeOptions: _activeOptions,
      ...props
    }: {
      to: string
      params?: Record<string, string>
      activeOptions?: unknown
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
  GalleryConfigCard: ({ card }: { card: { slug: string; title: string } }) => (
    <a href={`/c/${card.slug}`}>{card.title}</a>
  ),
}))

const { Route: FacetRoute } = await import('@/routes/status-lines.$facet')

const statusLines = ['a', 'b', 'c', 'd'].map((slug) => ({
  item: { kind: 'status-line', card: { slug, title: slug.toUpperCase() } },
  sortKey: 0,
}))

function renderFacet(
  slug: string,
  mods = 0,
  { lines = statusLines, otherFacets = [] as Array<{ slug: string; chipLabel: string }> } = {},
) {
  vi.spyOn(FacetRoute, 'useLoaderData').mockReturnValue({
    user: null,
    page: {
      slug,
      configs: { items: lines, total: lines.length },
      indexable: true,
      updated: '2026-09-08',
      otherFacets,
    },
    items: lines.map(({ item }) => item),
    mods,
  })
  const FacetPage = FacetRoute.options.component
  return render(FacetPage ? <FacetPage /> : null)
}

const linkTo = (name: string) => screen.getByRole('link', { name }).getAttribute('href')

describe('facet page content', () => {
  it('shows the trail back home, with no topics hub between', () => {
    renderFacet('git')

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(trail.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/'])
    expect(trail.getByText('Git')).toBeTruthy()
  })

  it('links every topic under the heading, this one marked current', () => {
    renderFacet('git', 0, {
      otherFacets: [
        { slug: 'token-usage', chipLabel: 'tokens' },
        { slug: 'bash', chipLabel: 'bash' },
      ],
    })

    const links = within(screen.getByRole('navigation', { name: 'Topics' })).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Git', '/status-lines/git'],
      ['Tokens', '/status-lines/token-usage'],
      ['Bash', '/status-lines/bash'],
    ])
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null, null])
  })

  // A visitor came to pick one: the list starts after a single line, not a column of notes.
  it('opens with one line, the count and the topic’s advice, then the list', () => {
    renderFacet('token-usage', 1)

    const line = screen.getByText(/^4 status lines and 1 mod\. Pick a number if you only glance/)
    const list = screen.getByRole('heading', { level: 2, name: 'Status lines and mods' })
    expect(line.compareDocumentPosition(list)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByText('Open one to copy its install prompt.')).toBeNull()
    expect(screen.queryByText(/Status lines print under the prompt/)).toBeNull()
    const answer = screen.getByText(/Token usage is under/)
    expect(list.compareDocumentPosition(answer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('ends with links to the best status lines and the gallery', () => {
    renderFacet('git')

    expect(linkTo('Best status lines')).toBe('/status-lines/best')
    expect(linkTo('Browse the gallery')).toBe('/')
  })

  it('shows the first 12 rows and keeps the rest in the page behind Show all', () => {
    const lines = Array.from({ length: 15 }, (_, i) => ({
      item: { kind: 'status-line', card: { slug: `line-${i + 1}`, title: `Line ${i + 1}` } },
      sortKey: 0,
    }))
    renderFacet('git', 0, { lines })

    const collapsed = (name: string) =>
      screen.getByRole('link', { name, hidden: true }).closest('[hidden]') !== null
    expect(collapsed('Line 12')).toBe(false)
    expect(collapsed('Line 13')).toBe(true)
    expect(collapsed('Line 15')).toBe(true)
    expect(screen.getByRole('button', { name: 'Show all 15' })).toBeTruthy()
  })

  it('states the live published count from the cards on the page', () => {
    renderFacet('git')

    expect(screen.getByText(/^4 status lines\. Pick a branch-only line/)).toBeTruthy()
    expect(screen.queryByText(/this page lists/i)).toBeNull()
  })

  it('counts the mods on the page beside the status lines', () => {
    renderFacet('git', 1)

    expect(screen.getByText(/^4 status lines and 1 mod\. Pick a branch-only line/)).toBeTruthy()
  })

  it('counts only mods when no status line carries the tag', () => {
    vi.spyOn(FacetRoute, 'useLoaderData').mockReturnValue({
      user: null,
      page: {
        slug: 'git',
        configs: { items: [], total: 0 },
        indexable: false,
        updated: null,
        otherFacets: [],
      },
      items: [],
      mods: 2,
    })
    const FacetPage = FacetRoute.options.component
    render(FacetPage ? <FacetPage /> : null)

    expect(screen.getByText(/^2 mods\. Pick a branch-only line/)).toBeTruthy()
  })

  it('answers the how-to question first under common questions, pointing to the guide', () => {
    renderFacet('token-usage')

    const faq = screen.getByRole('heading', { level: 2, name: 'Common questions' }).parentElement
    const questions = within(faq as HTMLElement).getAllByRole('heading', { level: 3 })
    expect(questions.map((q) => q.textContent)).toEqual([
      'How does a status line read token usage?',
      'How do I show a context bar instead of a number?',
      'Does the context window size change with the model?',
    ])
    const answer = questions[0]?.nextElementSibling
    expect(answer?.querySelector('.font-mono')?.textContent).toBe('context_window')
    expect(
      within(answer as HTMLElement)
        .getByRole('link', { name: 'Every field Claude Code sends is in the status line guide.' })
        .getAttribute('href'),
    ).toBe('/guide')
  })

  it('shows no common questions on facets without an FAQ', () => {
    renderFacet('cost')

    expect(screen.queryByRole('heading', { name: 'Common questions' })).toBeNull()
  })

  const headMeta = async (slug: string, mods?: number) => {
    const head = await FacetRoute.options.head?.({
      loaderData: {
        user: null,
        page: {
          slug,
          configs: { items: [], total: 0 },
          indexable: true,
          updated: null,
          otherFacets: [],
        },
        items: [],
        mods,
      },
    } as never)
    return head?.meta ?? []
  }

  // A tag edit must not retitle a ranking page, so the copy never depends on what the page lists.
  it("keeps a topic's title, description and H1 whether it lists 0 or 3 mods", async () => {
    for (const mods of [0, 3]) {
      expect(await headMeta('git', mods)).toEqual(
        expect.arrayContaining([
          { title: 'Claude Code Git Branch Status Lines & Mods | statuslin.es' },
          { property: 'og:title', content: 'Claude Code Git Branch Status Lines & Mods' },
          {
            name: 'description',
            content: expect.stringMatching(/^Claude Code status lines and mods that show your git/),
          },
        ]),
      )
      const { unmount } = renderFacet('git', mods)
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Claude Code status lines and mods that show git status',
        }),
      ).toBeTruthy()
      unmount()
    }
  })

  it('keeps status line copy on a topic that lists no mods, even if a mod carries the tag', async () => {
    expect(await headMeta('bash', 1)).toContainEqual({
      title: 'Claude Code Status Lines Written in Bash | statuslin.es',
    })
    renderFacet('bash', 1)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Claude Code status lines written in bash' }),
    ).toBeTruthy()
  })

  it('drops the brand from a facet title that would run past 60 characters', async () => {
    expect(await headMeta('themed')).toContainEqual({
      title: 'Catppuccin, Dracula & Themed Claude Code Status Lines',
    })
  })

  const headFor = async (slug: string, items: unknown[] = []) => {
    const head = await FacetRoute.options.head?.({
      loaderData: {
        user: null,
        page: {
          slug,
          configs: { items: [], total: 0 },
          indexable: true,
          updated: null,
          otherFacets: [],
        },
        items,
      },
    } as never)
    return ((head?.scripts ?? []) as Array<{ children: string }>).map(
      (script) => JSON.parse(script.children) as Record<string, unknown>,
    )
  }

  it('lists the page’s status lines and mods in its ItemList, in the order it shows them', async () => {
    const collection = (
      await headFor('cost', [
        { kind: 'status-line', card: { slug: 'a', title: 'A' } },
        { kind: 'mod', card: { slug: 'meter', title: 'Meter' } },
        { kind: 'status-line', card: { slug: 'b', title: 'B' } },
      ])
    ).find((node) => node['@type'] === 'CollectionPage')

    const list = collection?.mainEntity as { itemListElement: Array<{ url: string }> }
    expect(list.itemListElement.map((item) => item.url)).toEqual([
      expect.stringMatching(/\/c\/a$/),
      expect.stringMatching(/\/mods\/meter$/),
      expect.stringMatching(/\/c\/b$/),
    ])
  })

  it('emits FAQPage JSON-LD only for facets with an FAQ', async () => {
    const faqPage = (await headFor('quota')).find((node) => node['@type'] === 'FAQPage')
    expect(
      (faqPage?.mainEntity as Array<{ name: string }> | undefined)?.map((q) => q.name),
    ).toEqual([
      'How does a status line get my usage limits?',
      'Why is rate_limits missing from my status line input?',
      'How do I show when my limit resets?',
    ])
    expect((await headFor('cost')).map((node) => node['@type'])).toEqual([
      'CollectionPage',
      'BreadcrumbList',
    ])
  })

  it('names this topic in the breadcrumb JSON-LD, right after home', async () => {
    const crumbs = (await headFor('token-usage')).find((node) => node['@type'] === 'BreadcrumbList')
    const trail = (crumbs?.itemListElement ?? []) as Array<{ name: string; item: string }>
    expect(trail.map(({ name, item }) => [name, item])).toEqual([
      ['statuslin.es', window.location.origin],
      ['Tokens', `${window.location.origin}/status-lines/token-usage`],
    ])
  })

  it('shows the date the newest status line in the facet was updated', () => {
    renderFacet('git')

    expect(screen.getByText('Updated 2026-09-08')).toBeTruthy()
  })
})
