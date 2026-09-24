// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: vi.fn() }, signOut: vi.fn() },
}))

const { SignInButton } = await import('@/ui/sign-in-button')

describe('SignInButton', () => {
  it('keeps the full accessible name when phones show the short "Sign in" label', () => {
    render(<SignInButton />)

    const button = screen.getByRole('button', { name: 'Sign in with GitHub' })
    expect(button.getAttribute('aria-label')).toBe('Sign in with GitHub')
    const suffix = screen.getByText('with GitHub', { exact: false })
    expect(suffix.textContent).toBe(' with GitHub')
    expect(suffix.className.split(' ')).toEqual(['hidden', 'sm:inline'])
  })
})
