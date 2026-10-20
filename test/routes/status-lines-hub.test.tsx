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
      children: ReactNode
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

const { Route: HubRoute } = await import('@/routes/status-lines.index')

const topics = [
  { slug: 'git', statusLines: 4, mods: 0 },
  { slug: 'token-usage', statusLines: 3, mods: 2 },
]

function renderHub() {
  vi.spyOn(HubRoute, 'useLoaderData').mockReturnValue({ user: null, topics })
  const Hub = HubRoute.options.component
  return render(Hub ? <Hub /> : null)
}

async function headFor(listed: typeof topics) {
  const head = await HubRoute.options.head?.({
    loaderData: { user: null, topics: listed },
  } as never)
  return {
    meta: head?.meta ?? [],
    links: head?.links ?? [],
    jsonLd: ((head?.scripts ?? []) as Array<{ children: string }>).map(
      (script) => JSON.parse(script.children) as Record<string, unknown>,
    ),
  }
}

const linkTo = (name: string) => screen.getByRole('link', { name }).getAttribute('href')

describe('status line topics hub', () => {
  it('sits one step from home in its breadcrumb', () => {
    renderHub()

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(trail.getByRole('link', { name: 'statuslin.es' }).getAttribute('href')).toBe('/')
    expect(trail.getByText('Status lines')).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Claude Code status lines by topic' }),
    ).toBeTruthy()
  })

  it('links each topic page by its heading, with what it lists', () => {
    renderHub()

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Claude Code status lines that show git status',
      }),
    ).toBeTruthy()
    expect(linkTo('Claude Code status lines that show git status')).toBe('/status-lines/git')
    expect(screen.getByText('4 status lines')).toBeTruthy()
    // A topic that lists mods is named as its page names itself.
    expect(linkTo('Claude Code mods that show token usage')).toBe('/status-lines/token-usage')
    expect(screen.getByText('3 status lines and 2 mods')).toBeTruthy()
  })

  it('links the best status lines and the gallery', () => {
    renderHub()

    expect(linkTo('Best status lines')).toBe('/status-lines/best')
    expect(linkTo('Browse the gallery')).toBe('/')
  })

  it('has its own title, description and canonical', async () => {
    const { meta, links } = await headFor(topics)

    expect(meta).toContainEqual({ title: 'Claude Code Status Lines by Topic | statuslin.es' })
    expect(meta).toContainEqual({
      name: 'description',
      content: expect.stringMatching(/^Claude Code status lines grouped by what they show/),
    })
    expect(meta).not.toContainEqual({ name: 'robots', content: 'noindex, follow' })
    expect(links).toContainEqual({
      rel: 'canonical',
      href: expect.stringMatching(/\/status-lines$/),
    })
  })

  it('lists its topics in a CollectionPage beside its breadcrumb', async () => {
    const { jsonLd } = await headFor(topics)

    expect(jsonLd.map((node) => node['@type'])).toEqual(['CollectionPage', 'BreadcrumbList'])
    const list = jsonLd[0]?.mainEntity as { itemListElement: Array<{ name: string }> }
    expect(list.itemListElement.map((item) => item.name)).toEqual([
      'Claude Code status lines that show git status',
      'Claude Code mods that show token usage',
    ])
  })

  it('keeps an empty hub out of search', async () => {
    const { meta } = await headFor([])

    expect(meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })
})
