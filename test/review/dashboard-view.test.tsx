// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
})
