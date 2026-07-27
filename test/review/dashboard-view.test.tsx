// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardRow } from '@/review/queue'

// AppHeader (inside PageShell) needs the auth client and a router <Link>; stub both so the
// dashboard renders in isolation. We only assert on the header's user, not navigation.
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const { DashboardView } = await import('@/review/dashboard-views')

function contactNeededRow(): DashboardRow {
  return {
    config: {
      id: 'c1',
      slug: 'needs-contact',
      title: 'Needs contact',
      description: '',
      interpreter: 'bash',
      status: 'draft',
      authorId: 'u1',
      author: { name: 'Ada', username: 'ada', image: null },
      upvoteCount: 0,
      copyCount: 0,
      createdAt: new Date('2026-07-27T12:00:00Z'),
    },
    version: {
      id: 'v1',
      versionNumber: 1,
      source: 'echo hi',
      contentSha256: 'abc123',
      status: 'rejected',
      createdAt: new Date('2026-07-27T12:00:00Z'),
      networkHosts: [],
      readsClaudeToken: false,
      rejectionReason: 'Remove the updater.',
      rejectionEmailStatus: 'failed',
    },
    renderJob: {
      status: 'done',
      attempts: 1,
      error: null,
      createdAt: new Date('2026-07-27T12:00:00Z'),
      finishedAt: new Date('2026-07-27T12:01:00Z'),
    },
    previews: [],
  }
}

describe('DashboardView', () => {
  it('shows the signed-in admin in the header, not a sign-in button', () => {
    render(
      <DashboardView
        data={{
          rows: [],
          user: { name: 'Ada Lovelace', username: 'ada', image: null, role: 'admin' },
        }}
      />,
    )
    expect(screen.getByText('@ada')).toBeTruthy()
    expect(screen.queryByText(/sign in/i)).toBeNull()
  })

  it('shows a sign-in button only on the forbidden view', () => {
    render(<DashboardView data={{ forbidden: true }} />)
    expect(screen.queryByText('@ada')).toBeNull()
  })

  it('renders a sign-in prompt for signed-out visitors', () => {
    render(<DashboardView data={{ signedOut: true }} />)
    expect(screen.queryByText('@ada')).toBeNull()
    expect(screen.getAllByText(/sign in with github/i).length).toBeGreaterThan(0)
  })

  it('partitions rejected unsent submissions under Contact needed', () => {
    render(
      <DashboardView
        data={{
          rows: [contactNeededRow()],
          user: { name: 'Ada Lovelace', username: 'ada', image: null, role: 'admin' },
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Contact needed' })).toBeTruthy()
    expect(screen.getByText('Needs contact')).toBeTruthy()
  })

  it('partitions approved unsent submissions under Contact needed', () => {
    const approved = contactNeededRow()
    approved.config.title = 'Approved contact'
    approved.config.status = 'published'
    approved.version.status = 'approved'
    approved.version.rejectionReason = null
    approved.version.rejectionEmailStatus = null
    approved.version.approvalEmailStatus = 'failed'

    render(
      <DashboardView
        data={{
          rows: [approved],
          user: { name: 'Ada Lovelace', username: 'ada', image: null, role: 'admin' },
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Contact needed' })).toBeTruthy()
    expect(screen.getByText('Approved contact')).toBeTruthy()
  })
})
