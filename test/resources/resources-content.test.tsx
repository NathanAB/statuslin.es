// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ResourcesShowcase } from '@/compare/pages'
import type { GalleryCard } from '@/gallery/queries'
import type { RankedCard } from '@/gallery/why-line'

vi.mock('@tanstack/react-router', () => ({
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
    let href = to
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value)
      }
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

vi.mock('@/gallery/ranked-card-list', () => ({
  RankedCardList: ({ items, surface }: { items: RankedCard[]; surface: string }) => (
    <ul data-surface={surface}>
      {items.map(({ card }) => (
        <li key={card.slug}>{card.slug}</li>
      ))}
    </ul>
  ),
}))

const { RESOURCE_SECTIONS } = await import('@/resources/data')
const { ResourcesContent } = await import('@/resources/resources-content')

const NONE: ResourcesShowcase = { cards: [], alternatives: {} }
const ORIGIN = 'https://site.example.test'
const CCSTATUSLINE_URL = 'https://github.com/sirmalloc/ccstatusline'
const SHOWCASE: ResourcesShowcase = {
  cards: [
    { card: { slug: 'usage-bar' } as GalleryCard, why: 'Shows tokens.' },
    { card: { slug: 'powerline-cost' } as GalleryCard, why: 'Shows cost.' },
  ],
  alternatives: { [CCSTATUSLINE_URL]: 'ccstatusline' },
}

const ALL = RESOURCE_SECTIONS.flatMap((s) => s.resources)

describe('ResourcesContent', () => {
  it('renders the h1 and every section heading', () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Claude Code customization tools & resources',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Pick what to customize' })).toBeTruthy()
    for (const section of RESOURCE_SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeTruthy()
    }
  })

  it('gives each tool heading a stable anchor derived from its name', () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    const anchorOf = (name: string) =>
      screen.getByRole('heading', { level: 3, name }).getAttribute('id')
    expect(anchorOf('ccstatusline')).toBe('ccstatusline')
    expect(anchorOf('claude-powerline')).toBe('claude-powerline')
    expect(anchorOf('Claude Marketplace')).toBe('claude-marketplace')
  })

  it('never gives two headings the same anchor', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    const ids = [...container.querySelectorAll('h3[id]')].map((h) => h.id)
    expect(ids).toHaveLength(ALL.length)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('renders every entry as an external link that opens in a new tab, plus its description', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    for (const r of ALL) {
      const link = container.querySelector(`a[href="${r.url}"]`) as HTMLAnchorElement
      expect(link).not.toBeNull()
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(screen.getByText(r.description)).toBeTruthy()
    }
  })

  it('renders a destination badge for each resource card', () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    expect(screen.getAllByText('GitHub').length).toBeGreaterThanOrEqual(1)
  })

  it('cross-links mods, the best status lines, the guide and submit, with a submit button signed out', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    for (const href of ['/mods', '/status-lines/best', '/guide', '/submit']) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(screen.getByRole('heading', { level: 2, name: /get listed/i })).toBeTruthy()
    expect(screen.getByText(/^Made a status line or mod\?/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  // The page opens on a Claude Code session to pick a way to customize from (its own tests cover it).
  it('opens on the session to pick a way to customize from, without FAQPage', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Pick what to customize' })).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/FAQPage/)
  })

  // statuslin.es is a marketplace too: its add command sits with the others.
  it('offers the statuslin.es marketplace command beside the plugin marketplaces', () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    const section = screen.getByRole('heading', { level: 2, name: 'Mods & plugin marketplaces' })
      .parentElement as HTMLElement
    expect(
      within(section).getByText(
        '/plugin marketplace add https://site.example.test/marketplace.json',
      ),
    ).toBeTruthy()
  })

  it('links only gallery targets that earn their place, not the thin powerline facet', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    expect(container.querySelector('a[href="/status-lines/token-usage"]')).not.toBeNull()
    expect(container.querySelector('a[href="/c/quota-fallback-2a730aa6"]')).not.toBeNull()
    expect(container.querySelector('a[href="/status-lines/quota"]')).not.toBeNull()
    expect(container.querySelector('a[href="/status-lines/powerline"]')).toBeNull()
  })

  it('links to /submit when signed in', () => {
    const { container } = render(
      <ResourcesContent signedIn={true} showcase={NONE} origin={ORIGIN} />,
    )
    expect(container.querySelector('a[href="/submit"]')).not.toBeNull()
  })

  // A compared tool's card opens its alternatives page, with rendered status lines, before the
  // repo. The repo stays one click away on the same card.
  it('sends a compared tool to its alternatives page first and keeps its repo link', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={SHOWCASE} origin={ORIGIN} />,
    )

    const titleLink = (name: string) =>
      within(screen.getByRole('heading', { level: 3, name })).getByRole('link')
    expect(titleLink('ccstatusline alternatives').getAttribute('href')).toBe(
      '/alternatives/ccstatusline',
    )
    const repo = container.querySelector(`a[href="${CCSTATUSLINE_URL}"]`)
    expect(repo?.getAttribute('target')).toBe('_blank')
    expect(titleLink('claude-powerline').getAttribute('href')).toBe(
      'https://github.com/Owloops/claude-powerline',
    )
  })

  it('shows rendered status lines that do the same job right after the tools', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={SHOWCASE} origin={ORIGIN} />,
    )

    const tools = screen.getByRole('heading', { level: 2, name: 'Status line tools' })
    const previews = screen.getByRole('heading', {
      level: 2,
      name: 'Status lines that do the same job',
    })
    const next = screen.getByRole('heading', { level: 2, name: 'Usage & cost tracking' })
    expect(tools.compareDocumentPosition(previews) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(previews.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const list = container.querySelector('ul[data-surface="resources"]')
    expect([...(list?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'usage-bar',
      'powerline-cost',
    ])
    expect(
      screen.getByText(/^Status lines from the gallery that cover at least three/),
    ).toBeTruthy()
  })

  it('leaves the previews out when no status line matches', () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    expect(screen.queryByRole('heading', { name: 'Status lines that do the same job' })).toBeNull()
  })
})
