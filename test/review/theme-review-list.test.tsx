// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ModReviewRow } from '@/review/mod-queue'
import type { ReviewTheme } from '@/review/theme-review'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const { ModReviewCard } = await import('@/review/mod-review-card')

const PAPER_SOURCE =
  '{\n  "name": "Paper",\n  "base": "light",\n  "overrides": { "claude": "#d97757" }\n}\n'
const HOSTILE = '<img src=x onerror=alert(1)>'

type TerminalReview = Extract<ReviewTheme, { kind: 'terminal' }>
type DesktopReview = Extract<ReviewTheme, { kind: 'desktop' }>

function theme(over: Partial<TerminalReview>): TerminalReview {
  return {
    id: over.key ?? 'paper',
    kind: 'terminal',
    key: 'paper',
    name: 'Paper',
    window: 'light',
    source: PAPER_SOURCE,
    preview: [{ text: 'paper screen' }],
    usesTerminalColors: false,
    ...over,
  }
}

function desktopTheme(over: Partial<DesktopReview>): DesktopReview {
  return {
    id: over.key ?? 'night-reef',
    kind: 'desktop',
    key: 'night-reef',
    name: 'Night Reef',
    window: 'dark',
    switchSteps: ['/custom-theme night-reef'],
    preview: { src: '/admin/theme-previews/night-reef/desktop.png', width: 1100, height: 900 },
    ...over,
  }
}

function row(themes: ReviewTheme[]): ModReviewRow {
  return {
    mod: {
      id: 'm1',
      slug: 'pack',
      pluginName: 'pack',
      title: 'Theme pack',
      description: '',
      status: 'draft',
      authorGithub: 'octocat',
    },
    version: {
      id: 'v1',
      versionNumber: 1,
      repoUrl: 'https://github.com/octocat/pack',
      path: '',
      commitSha: 'a'.repeat(40),
      pluginVersion: '1.0.0',
      license: 'MIT',
      footprint: { events: [], calls: [] },
      status: 'pending',
      createdAt: new Date('2026-11-20T12:00:00Z'),
      rejectionReason: null,
      rejectionEmailStatus: null,
      approvalEmailStatus: null,
    },
    submitter: null,
    rendered: false,
    preview: [],
    desktop: { kind: 'nothing' },
    warnings: [],
    themes,
  }
}

/** The disclosure that holds one theme, found by its summary. */
const themeNamed = (name: string) =>
  screen.getByText(name, { selector: 'summary *, summary' }).closest('details') as HTMLElement

describe('themes on a mod review card', () => {
  it("shows each theme's name, window, preview and exact pinned file", () => {
    render(
      <ModReviewCard
        row={row([
          theme({}),
          theme({ key: 'night', name: 'Night', window: 'dark', preview: null }),
        ])}
      />,
    )

    expect(screen.getByText('Themes (2)')).toBeTruthy()
    const paper = within(themeNamed('Paper'))
    expect(paper.getByText('Light window')).toBeTruthy()
    expect(paper.getByRole('img', { name: 'Paper preview' }).textContent).toBe('paper screen')
    expect(paper.getByText('themes/paper.json')).toBeTruthy()
    expect(themeNamed('Paper').querySelector('pre')?.textContent).toBe(PAPER_SOURCE)

    const night = within(themeNamed('Night'))
    expect(night.getByText('Not rendered yet.')).toBeTruthy()
    expect(night.queryByRole('img')).toBeNull()
    expect(night.getByText('Dark window')).toBeTruthy()
  })

  it("shows a Desktop theme's whole-window shot above the exact steps its recording sent", () => {
    render(
      <ModReviewCard
        row={row([
          desktopTheme({ switchSteps: ['/custom-theme night-reef', '/fireworks auto off'] }),
          desktopTheme({ key: 'rainy', name: 'Rainy Window', switchSteps: [], preview: null }),
        ])}
      />,
    )

    const reef = within(themeNamed('Night Reef'))
    expect(reef.getByText('Claude Desktop, dark window')).toBeTruthy()
    expect(reef.getByRole('img', { name: 'Night Reef preview' }).getAttribute('src')).toBe(
      '/admin/theme-previews/night-reef/desktop.png',
    )
    expect(themeNamed('Night Reef').querySelector('pre')?.textContent).toBe(
      '/custom-theme night-reef\n/fireworks auto off',
    )

    const rainy = within(themeNamed('Rainy Window'))
    expect(rainy.getByText('Not rendered yet.')).toBeTruthy()
    expect(rainy.getByText('No switch steps: the mod sets it when a session starts.')).toBeTruthy()
  })

  it('keeps every theme of an 81-theme pack on the card, each folded into its own disclosure', () => {
    const themes = Array.from({ length: 81 }, (_, i) => theme({ key: `t${i}`, name: `Theme ${i}` }))
    const { container } = render(<ModReviewCard row={row(themes)} />)

    expect(container.querySelectorAll('details')).toHaveLength(81)
    expect(container.querySelectorAll('details[open]')).toHaveLength(0)
    expect(screen.getAllByRole('img', { name: /^Theme \d+ preview$/ })).toHaveLength(81)
  })

  it("shows an author's theme name as text, never as markup", () => {
    const { container } = render(<ModReviewCard row={row([theme({ name: HOSTILE })])} />)

    expect(themeNamed(HOSTILE)).toBeTruthy()
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  it("keeps a mod's hooks and calls above its themes, so a long pack can't push them out of sight", () => {
    const themes = Array.from({ length: 81 }, (_, i) => theme({ key: `t${i}`, name: `T${i}` }))
    const mixed = row(themes)
    mixed.version.footprint = { events: ['tool.call'], calls: ['$.http.fetch'] }
    render(<ModReviewCard row={mixed} />)

    const themesLabel = screen.getByText('Themes (81)')
    for (const label of ['Events it hooks', 'Calls it makes']) {
      const position = screen.getByText(label).compareDocumentPosition(themesLabel)
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('shows no themes section for a mod without themes', () => {
    render(<ModReviewCard row={row([])} />)

    expect(screen.queryByText(/^Themes \(/)).toBeNull()
  })
})
