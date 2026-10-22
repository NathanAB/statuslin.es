// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { getConfigDetail } from '@/gallery/functions'
import type { GalleryModCard } from '@/gallery/gallery-items'

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      onClick,
    }: {
      to: string
      params?: Record<string, string>
      children: React.ReactNode
      onClick?: () => void
    }) => (
      <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to} onClick={onClick}>
        {children}
      </a>
    ),
  }
})
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({
    capture,
    get_distinct_id: () => 'did',
    get_session_id: () => 'sid',
  }),
}))
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { Route: ConfigRoute } = await import('@/routes/c.$slug')

type Detail = NonNullable<Awaited<ReturnType<typeof getConfigDetail>>>

const DETAIL: Detail = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'powerline-dracula-6936b97c',
  title: 'Powerline Dracula',
  description: 'A Powerline-style status line.',
  interpreter: 'bash',
  tags: ['bash'],
  copyCount: 3,
  author: { name: 'Lindsey B', username: 'LindseyB', image: 'https://example.com/lindsey.png' },
  source: 'echo hi',
  sourceHtml: '<pre>echo hi</pre>',
  contentSha256: 'sha',
  networkHosts: [],
  readsClaudeToken: false,
  generatedContent: {
    summary: 'A Powerline bar with the branch and the model.',
    howItWorks: ['Reads the session JSON on stdin'],
    goodToKnow: ['Uses Nerd Font glyphs'],
    details: {},
  },
  previews: [{ scenarioKey: 'clean-main', segments: [{ text: 'main ✓' }] }],
  desktop: null,
  license: 'MIT',
  sourceUrl: 'https://example.com/x',
  updatedAt: '2026-07-06',
  related: [
    {
      configId: '33333333-3333-4333-8333-333333333333',
      slug: 'minimal-ba63ffb8',
      title: 'Minimal',
      interpreter: 'bash',
      copyCount: 1,
      preview: null,
    },
  ],
  facetLabels: ['bash'],
  primaryFacet: { slug: 'bash', topic: 'Bash' },
}

const COST_MOD: GalleryModCard = {
  modId: '44444444-4444-4444-8444-444444444444',
  slug: 'cost-meter',
  title: 'Cost Meter',
  description: 'A cost meter.',
  authorGithub: 'octocat',
  copyCount: 2,
  tags: ['bash'],
  preview: [{ text: 'meter' }],
  desktopShot: null,
}

function renderPage(viewerIsAuthor = false, mods: GalleryModCard[] = [], detail: Detail = DETAIL) {
  vi.spyOn(ConfigRoute, 'useLoaderData').mockReturnValue({
    detail,
    user: null,
    viewerIsAuthor,
    mods,
  })
  const Page = ConfigRoute.options.component
  return render(Page ? <Page /> : null)
}

afterEach(() => {
  vi.restoreAllMocks()
})

function expectInOrder(nodes: Node[]) {
  for (let i = 1; i < nodes.length; i++) {
    const earlier = nodes[i - 1] as Node
    const later = nodes[i] as Node
    expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
}

const h2 = (name: string) => screen.getByRole('heading', { level: 2, name })

describe('status line page', () => {
  it('runs header, install, preview, what it does, source, then related', () => {
    renderPage()

    expectInOrder([
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
      screen.getByRole('heading', { level: 1, name: 'Powerline Dracula' }),
      screen.getByText('by'),
      screen.getByText('A Powerline-style status line.'),
      screen.getByRole('button', { name: 'Copy install prompt for Powerline Dracula' }),
      screen.getByText(/^In Claude Desktop\?/),
      h2('Preview'),
      h2('What it does'),
      h2('Source'),
      h2('More status lines'),
    ])
  })

  // Sections 24px apart, at the size of the text inside them, ran into each other: the header and
  // each section are set apart by a rule, in one list.
  it('sets the header and each section apart from the one before it', () => {
    renderPage()

    const list = h2('Preview').closest('[data-slot="ruled-sections"]')
    expect(list).not.toBeNull()
    expect(
      ['What it does', 'Source', 'More status lines'].map((name) => list?.contains(h2(name))),
    ).toEqual([true, true, true])
    expect(
      list?.contains(screen.getByRole('heading', { level: 1, name: 'Powerline Dracula' })),
    ).toBe(true)
  })

  // Nested boxes read as clutter: no section is a card, and the other status lines are the
  // gallery's own rows, each with its preview, not cards inside a card.
  it('lists the other status lines as gallery rows, with no box inside a box', () => {
    const { container } = renderPage(false, [COST_MOD])

    expect(container.querySelector('[data-slot="card"]')).toBeNull()
    const more = within(screen.getByRole('region', { name: 'More status lines' }))
    expect(more.getAllByRole('article').map((row) => row.getAttribute('data-slot'))).toEqual([
      'gallery-row',
    ])
    expect(more.getByRole('link', { name: 'Minimal' }).getAttribute('href')).toBe(
      '/c/minimal-ba63ffb8',
    )
  })

  it('states the script’s facts and its page copy in What it does', () => {
    renderPage()

    const card = h2('What it does').closest('section') as HTMLElement
    const what = within(card)
    expect(what.getByText('A Powerline bar with the branch and the model.')).toBeTruthy()
    expect(what.getByText('Written in')).toBeTruthy()
    expect(what.getByText('Bash')).toBeTruthy()
    expect(what.queryByText('Uses Nerd Font glyphs')).toBeNull()
    expect(what.queryByText('Reads your Claude login')).toBeNull()
  })

  // A searcher decides at the install button: that it was reviewed, what it can reach and what it needs
  // sit right after it, not pages below, and the help for a line that doesn't show is one click.
  it('says what to know before installing, right after the install button', () => {
    renderPage()

    const panel = screen.getByRole('region', { name: 'Before you install' })
    expect([...panel.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Reviewed before listing · this version, Jul 6, 2026',
      "Doesn't connect to the internet",
      'Uses Nerd Font glyphs',
    ])
    expect(
      within(panel)
        .getByRole('link', { name: /Not showing after you paste/ })
        .getAttribute('href'),
    ).toBe('/guide/status-line-not-showing')
    expectInOrder([
      screen.getByRole('button', { name: 'Copy install prompt for Powerline Dracula' }),
      panel,
      h2('Preview'),
    ])
  })

  // Reading the sign-in token or connecting to hosts is a risk to weigh, not a topic: it leaves the topic chips.
  it('keeps the risk facts out of the topic chips in the header', () => {
    renderPage(false, [], { ...DETAIL, tags: ['bash', 'reads-token'], readsClaudeToken: true })

    expect(screen.queryByRole('link', { name: /reads token/i })).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'Before you install' })).getByText(
        'Reads your Claude sign-in token',
      ),
    ).toBeTruthy()
  })

  it('puts the owner’s update strip above the header', () => {
    renderPage(true)

    expectInOrder([
      screen.getByText('This is your status line.'),
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ])
  })

  it('links the mods that share its tags after the other status lines', () => {
    renderPage(false, [COST_MOD])

    const card = h2('Related mods').closest('section') as HTMLElement
    expect(within(card).getByRole('link', { name: 'Cost Meter' }).getAttribute('href')).toBe(
      '/mods/cost-meter',
    )
    expectInOrder([h2('More status lines'), h2('Related mods')])
  })

  it('captures clicks on its mods as status line page related cards, by position', () => {
    renderPage(false, [COST_MOD])

    fireEvent.click(screen.getByRole('link', { name: 'Cost Meter' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: COST_MOD.modId,
      slug: 'cost-meter',
      surface: 'related',
      position: 1,
    })
  })

  it('shows no mods block when no mod shares its tags', () => {
    renderPage()

    expect(screen.queryByRole('heading', { name: 'Related mods' })).toBeNull()
  })
})

describe('status line page in Claude Desktop', () => {
  const SHOT = { src: '/config-previews/v/desktop.png?r=1', width: 790, height: 40 }
  const preview = () => within(h2('Preview').closest('section') as HTMLElement)

  it('shows the Desktop shot under the terminal rows, with the plugin that drew it', () => {
    renderPage(false, [], { ...DETAIL, desktop: { kind: 'shot', shot: SHOT } })

    const shot = preview().getByRole('img', { name: 'Powerline Dracula in Claude Desktop' })
    expect(shot.getAttribute('src')).toBe(SHOT.src)
    expectInOrder([
      preview().getByText('main ✓'),
      preview().getByText('In Claude Desktop'),
      shot,
      preview().getByRole('link', { name: 'statusline-anywhere' }),
    ])
    expect(preview().getByText(/Recorded with/).textContent).toBe(
      'Recorded with statusline-anywhere.',
    )
  })

  it('says when it draws nothing in Claude Desktop, with the plugin it was recorded with', () => {
    renderPage(false, [], { ...DETAIL, desktop: { kind: 'nothing' } })

    expect(preview().queryByRole('img')).toBeNull()
    expect(preview().getByText('Draws nothing in Claude Desktop.')).toBeTruthy()
    expect(preview().getByRole('link', { name: 'statusline-anywhere' })).toBeTruthy()
  })

  it('drops the Desktop note from the install slot once the preview links the plugin', () => {
    for (const desktop of [{ kind: 'shot' as const, shot: SHOT }, { kind: 'nothing' as const }]) {
      const { unmount } = renderPage(false, [], { ...DETAIL, desktop })

      expect(screen.queryByText(/^In Claude Desktop\?/)).toBeNull()
      expect(screen.getAllByRole('link', { name: 'statusline-anywhere' })).toHaveLength(1)
      unmount()
    }
  })

  it('keeps the Desktop note, and adds nothing to the preview, before it is recorded', () => {
    renderPage()

    expect(screen.getByText(/^In Claude Desktop\?/)).toBeTruthy()
    expect(preview().queryByText('In Claude Desktop')).toBeNull()
    expect(preview().queryByRole('link', { name: 'statusline-anywhere' })).toBeNull()
  })
})
