// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: vi.fn() }, signOut: vi.fn() },
}))

const { SignInButton } = await import('@/ui/sign-in-button')

describe('SignInButton', () => {
  // The header bar and the phone menu say just "Sign in" beside the GitHub mark.
  it('says Sign in with the GitHub mark in the header bar and the phone menu', () => {
    for (const look of ['bar', 'menu'] as const) {
      const { unmount } = render(<SignInButton look={look} />)
      const button = screen.getByRole('button', { name: 'Sign in with GitHub' })
      expect(button.textContent).toBe('Sign in')
      expect(button.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('keeps the full accessible name when phones show the short "Sign in" label', () => {
    render(<SignInButton />)

    const button = screen.getByRole('button', { name: 'Sign in with GitHub' })
    expect(button.getAttribute('aria-label')).toBe('Sign in with GitHub')
    const suffix = screen.getByText('with GitHub', { exact: false })
    expect(suffix.textContent).toBe(' with GitHub')
    expect(suffix.className.split(' ')).toEqual(['hidden', 'sm:inline'])
  })
})
