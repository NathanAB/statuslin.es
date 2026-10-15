// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ModReviewRow } from '@/review/mod-queue'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const { ModReviewCard } = await import('@/review/mod-review-card')
const { DashboardView } = await import('@/review/dashboard-views')

const SHA = 'a'.repeat(40)
const LIVE_SHA = 'b'.repeat(40)

function row(over: Partial<ModReviewRow> = {}): ModReviewRow {
  return {
    mod: {
      id: 'm1',
      slug: 'meter',
      pluginName: 'meter',
      title: 'Context meter',
      description: 'A meter above the prompt.',
      status: 'draft',
      authorGithub: 'octocat',
    },
    version: {
      id: 'v1',
      versionNumber: 1,
      repoUrl: 'https://github.com/octocat/mods',
      path: 'plugins/meter',
      commitSha: SHA,
      pluginVersion: '1.2.0',
      license: 'MIT',
      footprint: { events: ['ui.render{component=AbovePrompt}'], calls: ['$.fs.read'] },
      status: 'pending',
      createdAt: new Date('2026-10-12T12:00:00Z'),
      rejectionReason: null,
      rejectionEmailStatus: null,
      approvalEmailStatus: null,
    },
    submitter: { name: 'Ada', username: 'ada', image: null },
    rendered: true,
    preview: [{ text: '▮▮▮▯ 62% context' }],
    desktop: { kind: 'shot', src: '/admin/mod-previews/v1/desktop.png', width: 790, height: 52 },
    warnings: [],
    ...over,
  }
}

describe('ModReviewCard', () => {
  it('shows a rendered submission with both previews, its source and the decision buttons', () => {
    render(<ModReviewCard row={row()} />)

    expect(screen.getByText('Context meter')).toBeTruthy()
    expect(screen.getByText('▮▮▮▯ 62% context')).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('src')).toBe('/admin/mod-previews/v1/desktop.png')
    expect(screen.getByText('ui.render{component=AbovePrompt}')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /aaaaaaaaaaaa · plugins\/meter/ }).getAttribute('href'),
    ).toBe(`https://github.com/octocat/mods/tree/${SHA}/plugins/meter`)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })

  it('says how to render a mod that has not rendered, and offers no decision', () => {
    render(<ModReviewCard row={row({ rendered: false, preview: null, desktop: null })} />)

    expect(screen.getByText(/bun run render:mods --slug meter/)).toBeTruthy()
    expect(screen.getAllByText('Not rendered yet.')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('labels a decided submission the way a status line card does', () => {
    const rejected = {
      ...row().version,
      status: 'rejected',
      rejectionReason: 'Draws over the prompt',
    }
    render(<ModReviewCard row={row({ version: rejected })} />)

    expect(screen.getByText('Not accepted')).toBeTruthy()
    expect(screen.getByText('Draws over the prompt')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('links an update to its diff against the live commit and lists its warnings', () => {
    const live = { ...row().version, id: 'v0', commitSha: LIVE_SHA }
    render(
      <ModReviewCard
        row={row({ live, warnings: ['the footprint adds events [session.start]'] })}
      />,
    )

    expect(screen.getByText('Update to meter')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Compare with live/ }).getAttribute('href')).toBe(
      `https://github.com/octocat/mods/compare/${LIVE_SHA}...${SHA}`,
    )
    expect(screen.getByText('the footprint adds events [session.start]')).toBeTruthy()
  })
})

describe('DashboardView with mods', () => {
  it('lists submitted mods next to status lines', () => {
    render(
      <DashboardView
        data={{
          rows: [],
          mods: [row()],
          user: { name: 'Admin', username: 'admin', image: null, role: 'admin' },
        }}
      />,
    )

    expect(screen.getByText('Context meter')).toBeTruthy()
    expect(screen.queryByText('No submissions in flight.')).toBeNull()
  })
})
