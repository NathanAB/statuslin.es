// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Spy on the Better Auth social sign-in so we can assert the signed-out one-click redirect.
const socialSignIn = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: (opts: unknown) => socialSignIn(opts) } },
}))

// The component reaches for the router at render time; stub it so it renders in isolation.
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
// NumberFlow animates the count; render it as plain text in tests.
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => <>{value}</> }))
// Vote toggling isn't exercised on the signed-out path, but the module is imported at load time.
vi.mock('@/votes/functions', () => ({ toggleVoteFn: vi.fn() }))

const { UpvoteButton } = await import('@/votes/upvote-button')

afterEach(() => socialSignIn.mockClear())

describe('UpvoteButton (signed out)', () => {
  it('starts GitHub sign-in returning to the config page, not a link to /login', () => {
    render(
      <UpvoteButton
        configId="cfg-1"
        slug="cool-line"
        initialCount={3}
        initialVoted={false}
        signedIn={false}
      />,
    )

    // It is an action button, not a link to an intermediate sign-in page.
    expect(screen.queryByRole('link', { name: /sign in to vote/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /sign in to vote/i }))
    expect(socialSignIn).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/c/cool-line' })
  })
})
