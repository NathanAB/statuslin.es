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
    expect(screen.getByRole('heading', { level: 2, name: 'What you can customize' })).toBeTruthy()
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

  // A plain page header, so it doesn't read as the home page: the title and one sentence that
  // names the two tools most visitors search for.
  it('opens on a title and one sentence naming the most-searched tools, no demo', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    expect(screen.getByText(/ccstatusline and claude-powerline/)).toBeTruthy()
    expect(container.querySelector('[role="img"]')).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  // Every way to customize, each with what it changes and its docs, in the page from the start.
  it('maps every way to customize Claude Code, each with its official docs, without FAQPage', () => {
    const { container } = render(
      <ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />,
    )
    const map = screen
      .getByRole('heading', { level: 2, name: 'What you can customize' })
      .closest('section') as HTMLElement
    expect(
      within(map)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Mods',
      'Status line',
      'Themes',
      'Spinner verbs',
      'Output styles',
      'Hooks',
      'Skills',
      'Subagents',
    ])
    // Off-site, so it says whose docs they are; the arrow is decoration.
    expect(within(map).getAllByRole('link', { name: /^Anthropic's docs for / })).toHaveLength(8)
    expect(
      within(map).getByRole('link', { name: "Anthropic's docs for mods" }).getAttribute('href'),
    ).toBe('https://code.claude.com/docs/en/plugins/mods/overview')
    expect(within(map).getByRole('link', { name: 'Browse mods' }).getAttribute('href')).toBe(
      '/mods',
    )
    expect(container.innerHTML).not.toMatch(/FAQPage/)
  })

  // A row of links wrapped wherever the width broke it; one link per line reads as a list.
  it("lists a tile's links one per line at its foot, the gallery's first and the docs last", () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    const tile = screen.getByRole('heading', { level: 3, name: 'Status line' })
      .parentElement as HTMLElement
    const foot = tile.querySelector('[data-slot="panel-foot"]') as HTMLElement
    expect(
      within(foot)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Best status lines →', 'Write your own →', "Anthropic's docs for status line ↗"])
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
    // The "reviewed copy of ohugonnot/claude-code-statusline" line drew 17 impressions and no clicks.
    expect(container.querySelector('a[href="/c/quota-fallback-2a730aa6"]')).toBeNull()
    expect(screen.queryByText(/ohugonnot/)).toBeNull()
    expect(container.querySelector('a[href="/status-lines/quota"]')).not.toBeNull()
    expect(container.querySelector('a[href="/status-lines/powerline"]')).toBeNull()
  })

  // Above the cards it pushed this column's cards below its neighbour's; it reads as an "or" after.
  it("puts the usage group's in-gallery note after its tools, so the columns' cards line up", () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    const group = screen.getByRole('heading', { level: 2, name: 'Usage & cost tracking' })
      .parentElement as HTMLElement
    expect(group.lastElementChild?.textContent).toMatch(/^Or watch your limits inside Claude Code/)
    expect(group.children[1]?.textContent).not.toMatch(/Or watch your limits/)
  })

  it('links to /submit when signed in', () => {
    const { container } = render(
      <ResourcesContent signedIn={true} showcase={NONE} origin={ORIGIN} />,
    )
    expect(container.querySelector('a[href="/submit"]')).not.toBeNull()
  })

  // 93% of the page's visible searches name a tool, so a tool's name opens the tool itself. A
  // compared tool's alternatives page stays one click away in the line under its name.
  it("links a compared tool's name to its repo and its alternatives page from the line under it", () => {
    render(<ResourcesContent signedIn={false} showcase={SHOWCASE} origin={ORIGIN} />)

    const heading = screen.getByRole('heading', { level: 3, name: 'ccstatusline' })
    const name = within(heading).getByRole('link')
    expect(name.getAttribute('href')).toBe(CCSTATUSLINE_URL)
    expect(name.getAttribute('target')).toBe('_blank')
    const meta = heading.nextElementSibling as HTMLElement
    expect(meta.textContent).toBe('GitHub · Alternatives to ccstatusline')
    expect(
      within(meta).getByRole('link', { name: 'Alternatives to ccstatusline' }).getAttribute('href'),
    ).toBe('/alternatives/ccstatusline')
    const plain = screen.getByRole('heading', { level: 3, name: 'claude-powerline' })
    expect(within(plain).getByRole('link').getAttribute('href')).toBe(
      'https://github.com/Owloops/claude-powerline',
    )
    expect(plain.nextElementSibling?.textContent).toBe('GitHub')
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
    const next = screen.getByRole('heading', { level: 2, name: 'What you can customize' })
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

  // Most visitors arrive searching a status line tool by name, so the tools come right after the
  // hero, before the marketplaces.
  it('puts the status line tools right after the hero', () => {
    render(<ResourcesContent signedIn={false} showcase={NONE} origin={ORIGIN} />)
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2s.slice(0, 3)).toEqual([
      'Status line tools',
      'What you can customize',
      'Mods & plugin marketplaces',
    ])
  })
})
