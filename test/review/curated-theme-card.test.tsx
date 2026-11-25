// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CuratedThemeRow } from '@/review/curated-theme-queue'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const { CuratedThemeCard } = await import('@/review/curated-theme-card')
const { DashboardView } = await import('@/review/dashboard-views')

const SHA = 'c'.repeat(40)
const SOURCE = '{ "name": "Paper", "base": "light" }'

function row(over: Partial<CuratedThemeRow> = {}): CuratedThemeRow {
  return {
    mod: { slug: 'paper-pack', title: 'Paper pack', authorGithub: 'octocat', status: 'draft' },
    version: {
      id: 'v2',
      versionNumber: 2,
      repoUrl: 'https://github.com/octocat/themes',
      path: 'plugins/paper',
      commitSha: SHA,
    },
    rendered: true,
    themes: [
      {
        id: 't1',
        kind: 'terminal',
        key: 'paper',
        name: 'Paper',
        window: 'light',
        source: SOURCE,
        preview: [{ text: 'paper screen' }],
        usesTerminalColors: false,
        change: null,
      },
    ],
    ...over,
  }
}

describe('CuratedThemeCard', () => {
  it('shows the commit and every theme with its file, and the publish dry run once rendered', () => {
    render(<CuratedThemeCard row={row()} />)

    expect(screen.getByText('Paper pack')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /cccccccccccc · plugins\/paper/ }).getAttribute('href'),
    ).toBe(`https://github.com/octocat/themes/tree/${SHA}/plugins/paper`)
    expect(screen.getByText('Paper')).toBeTruthy()
    expect(screen.getByText(SOURCE)).toBeTruthy()
    expect(screen.getByText(`bun run scripts/publish-mod.ts paper-pack ${SHA}`)).toBeTruthy()
    expect(screen.queryByText(/render:mods/)).toBeNull()
  })

  it('says to render a version whose themes have not all rendered, and not to publish yet', () => {
    render(<CuratedThemeCard row={row({ rendered: false })} />)

    expect(screen.getByText('bun run render:mods --slug paper-pack')).toBeTruthy()
    expect(screen.queryByText(/publish-mod/)).toBeNull()
  })

  // Publishing a curated plugin stays the CLI's, which checks the commit against GitHub.
  it('offers no approve button', () => {
    render(<CuratedThemeCard row={row()} />)

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})

describe('DashboardView with curated theme plugins', () => {
  it('lists curated plugins waiting to publish themes in their own section', () => {
    render(
      <DashboardView
        data={{
          rows: [],
          mods: [],
          curated: [row()],
          user: { name: 'Admin', username: 'admin', image: null, role: 'admin' },
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Curated theme plugins' })).toBeTruthy()
    expect(screen.getByText('Paper pack')).toBeTruthy()
    expect(screen.queryByText('No submissions in flight.')).toBeNull()
  })
})
