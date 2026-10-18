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
  primaryFacet: { slug: 'bash', heading: 'Claude Code status lines written in bash' },
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

function renderPage(viewerIsAuthor = false, mods: GalleryModCard[] = []) {
  vi.spyOn(ConfigRoute, 'useLoaderData').mockReturnValue({
    detail: DETAIL,
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
      screen.getByText('In Claude Desktop?'),
      h2('Preview'),
      h2('What it does'),
      h2('Source'),
      h2('More status lines'),
    ])
  })

  it('states the script’s facts and its page copy in What it does', () => {
    renderPage()

    const card = h2('What it does').closest('[data-slot="card"]') as HTMLElement
    const what = within(card)
    expect(what.getByText('A Powerline bar with the branch and the model.')).toBeTruthy()
    expect(what.getByText('Written in')).toBeTruthy()
    expect(what.getByText('Bash')).toBeTruthy()
    expect(what.getByText('Uses Nerd Font glyphs')).toBeTruthy()
    expect(what.queryByText('Reads your Claude login')).toBeNull()
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

    const card = h2('Related mods').closest('[data-slot="card"]') as HTMLElement
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
