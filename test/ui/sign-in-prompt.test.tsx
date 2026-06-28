// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Spy on the Better Auth social sign-in; the prompt's button should start GitHub OAuth on click.
const socialSignIn = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: (opts: unknown) => socialSignIn(opts) }, signOut: vi.fn() },
}))

// The shell + header pull in a router <Link>; stub it to a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { SignInPrompt } = await import('@/ui/sign-in-prompt')

afterEach(() => socialSignIn.mockClear())

describe('SignInPrompt', () => {
  it('renders the title and a sign-in button that starts GitHub OAuth', () => {
    render(<SignInPrompt title="Sign in to submit a status line" />)

    expect(screen.getByRole('heading', { name: 'Sign in to submit a status line' })).toBeTruthy()
    // The header also carries a sign-in button when signed out; the prompt adds its own.
    const [button] = screen.getAllByRole('button', { name: /sign in with github/i })
    if (!button) throw new Error('expected a sign-in button')

    fireEvent.click(button)
    expect(socialSignIn).toHaveBeenCalledWith(expect.objectContaining({ provider: 'github' }))
  })
})
