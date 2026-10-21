// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

const posthog = { capture: vi.fn() }
vi.mock('@posthog/react', () => ({ usePostHog: () => posthog }))

const startGitHubSignIn = vi.fn()
vi.mock('@/lib/sign-in', () => ({
  startGitHubSignIn: (...args: unknown[]) => startGitHubSignIn(...args),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string
    search?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>
      {children}
    </a>
  ),
}))

const { SubmitChooser } = await import('@/ui/submit-cta')

afterEach(() => startGitHubSignIn.mockClear())

const choices = () => screen.getByRole('radiogroup', { name: 'What are you submitting?' })

describe('SubmitChooser', () => {
  it('asks what you are submitting, a status line to start with', () => {
    render(<SubmitChooser signedIn />)

    expect(
      within(choices())
        .getAllByRole('radio')
        .map((r) => [r.textContent, r.getAttribute('aria-checked')]),
    ).toEqual([
      ['Status line', 'true'],
      ['Mod', 'false'],
    ])
    // The site calls both kinds mods, so the panel's heading says mod whichever kind is picked.
    expect(screen.getByRole('heading', { name: 'Submit a mod' })).toBeTruthy()
  })

  it('links a signed-in visitor to the form for what they chose', () => {
    render(<SubmitChooser signedIn />)
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/submit')

    fireEvent.click(within(choices()).getByRole('radio', { name: 'Mod' }))

    expect(screen.getByRole('heading', { name: 'Submit a mod' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe(
      '/submit?kind=mod',
    )
  })

  it('starts GitHub sign-in for a signed-out visitor, back to the form they chose', () => {
    render(<SubmitChooser signedIn={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    expect(startGitHubSignIn).toHaveBeenLastCalledWith('/submit', 'submit', posthog)

    fireEvent.click(within(choices()).getByRole('radio', { name: 'Mod' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    expect(startGitHubSignIn).toHaveBeenLastCalledWith('/submit?kind=mod', 'submit', posthog)
  })

  it('has no axe violations', async () => {
    const { container } = render(<SubmitChooser signedIn={false} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
