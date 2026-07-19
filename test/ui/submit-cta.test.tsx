// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Spy on the Better Auth social sign-in so we can assert the one-click redirect when signed out.
const socialSignIn = vi.fn().mockResolvedValue(undefined)
const capture = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: (opts: unknown) => socialSignIn(opts) } },
}))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

// TanStack Router's <Link> needs a router context; stub it to a plain anchor so the
// CTA renders in isolation (we only assert href + the OAuth click, not navigation).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { SubmitCta } = await import('@/ui/submit-cta')

afterEach(() => {
  socialSignIn.mockClear()
  capture.mockClear()
})

describe('SubmitCta', () => {
  it('links to the submit form when signed in', () => {
    render(<SubmitCta signedIn />)
    const link = screen.getByRole('link', { name: /submit a status line/i })
    expect(link.getAttribute('href')).toBe('/submit')
    fireEvent.click(link)
    expect(socialSignIn).not.toHaveBeenCalled()
  })

  it('starts GitHub sign-in (returning to /submit) when signed out', () => {
    render(<SubmitCta signedIn={false} />)
    // Signed out it is a button, not a link — clicking starts OAuth straight away.
    expect(screen.queryByRole('link', { name: /submit a status line/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /submit a status line/i }))
    expect(socialSignIn).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/submit' })
    expect(capture).toHaveBeenCalledWith('auth_started', {
      provider: 'github',
      entryPoint: 'submit',
      returnPath: '/submit',
      $current_url: '/submit',
    })
  })
})
