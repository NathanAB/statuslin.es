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

const statusLines = ['a', 'b', 'c', 'd'].map((slug) => ({
  item: { kind: 'status-line', card: { slug, title: slug.toUpperCase() } },
  sortKey: 0,
}))

function renderFacet(slug: string, mods = 0) {
  vi.spyOn(FacetRoute, 'useLoaderData').mockReturnValue({
    user: null,
    page: {
      slug,
      configs: { items: statusLines, total: statusLines.length },
      indexable: true,
      updated: '2026-09-08',
      otherFacets: [],
    },
    items: statusLines.map(({ item }) => item),
    mods,
  })
  const FacetPage = FacetRoute.options.component
  return render(FacetPage ? <FacetPage /> : null)
}

describe('facet page content', () => {
  it('states the live published count from the cards on the page', () => {
    renderFacet('git')

    expect(screen.getByText('4 status lines.')).toBeTruthy()
    expect(screen.queryByText(/this page lists/i)).toBeNull()
  })

  it('counts the mods on the page beside the status lines', () => {
    renderFacet('git', 1)

    expect(screen.getByText('4 status lines and 1 mod.')).toBeTruthy()
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

    expect(screen.getByText('2 mods.')).toBeTruthy()
  })

  it('answers the how-to question and shows common questions on answered facets', () => {
    renderFacet('token-usage')

    const answer = [...document.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('Token usage is under context_window.'),
    )
    expect(answer?.querySelector('.font-mono')?.textContent).toBe('context_window')
    expect(screen.getByRole('heading', { level: 2, name: 'Common questions' })).toBeTruthy()
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'How do I show a context bar instead of a number?',
      }),
    ).toBeTruthy()
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

  it('names status lines and mods in the title, description and H1 when the page lists mods', async () => {
    const meta = await headMeta('token-usage', 3)
    expect(meta).toEqual(
      expect.arrayContaining([
        { title: 'Claude Code Token Usage: Status Lines & Mods | statuslin.es' },
        { property: 'og:title', content: 'Claude Code Token Usage: Status Lines & Mods' },
        {
          name: 'description',
          content: expect.stringMatching(
            /^Claude Code status lines and mods that show context window usage/,
          ),
        },
      ]),
    )

    renderFacet('token-usage', 3)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Claude Code status lines and mods that show token usage',
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        "Status lines print under the prompt. Each mod's page shows where it draws.",
      ),
    ).toBeTruthy()
  })

  it('keeps status-lines wording on a mod-ready facet while it lists no mods', async () => {
    const meta = await headMeta('token-usage', 0)
    expect(meta).toContainEqual({
      title: 'Claude Code Status Lines That Show Token Usage',
    })
    expect(meta).toContainEqual({
      name: 'description',
      content: expect.stringMatching(/^Status lines that track context window usage/),
    })

    renderFacet('token-usage', 0)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Claude Code status lines that show token usage',
      }),
    ).toBeTruthy()
    expect(screen.queryByText(/Each mod's page/)).toBeNull()
  })

  it('never claims mods on a facet with no mod copy, even if a mod carries the tag', async () => {
    expect(await headMeta('bash', 1)).toContainEqual({
      title: 'Claude Code Status Lines Written in Bash | statuslin.es',
    })
    renderFacet('bash', 1)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Claude Code status lines written in bash' }),
    ).toBeTruthy()
  })

  it('drops the brand from a facet title that would run past 60 characters', async () => {
    expect(await headMeta('git')).toContainEqual({
      title: 'Claude Code Status Lines With Git Branch & Diff Stats',
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
      'Why is rate_limits missing from my status line input?',
      'How do I show when my limit resets?',
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
