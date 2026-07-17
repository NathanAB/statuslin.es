import { afterEach, describe, expect, it, vi } from 'vitest'

// Spy on the Better Auth social sign-in so we can assert the redirect args without a network call.
const socialSignIn = vi.fn().mockResolvedValue(undefined)
const capture = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: (opts: unknown) => socialSignIn(opts) } },
}))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { startGitHubSignIn } = await import('@/lib/sign-in')

afterEach(() => {
  socialSignIn.mockClear()
  capture.mockClear()
})

describe('startGitHubSignIn', () => {
  it('starts GitHub OAuth returning to the given path', () => {
    startGitHubSignIn('/submit')
    expect(socialSignIn).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/submit' })
  })

  it('sanitizes an unsafe return path to "/"', () => {
    startGitHubSignIn('//evil.com')
    expect(socialSignIn).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/' })
  })

  it('defaults to "/" when no path is given', () => {
    startGitHubSignIn()
    expect(socialSignIn).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/' })
  })

  it('tracks the entry point and return path when OAuth starts', () => {
    startGitHubSignIn('/submit', 'submit', { capture })
    expect(capture).toHaveBeenCalledWith('auth_started', {
      provider: 'github',
      entryPoint: 'submit',
      returnPath: '/submit',
      $current_url: '/submit',
    })
  })

  it('does not send query parameters in auth analytics', () => {
    startGitHubSignIn('/?tags=git&private=secret', 'header', { capture })

    expect(capture).toHaveBeenCalledWith('auth_started', {
      provider: 'github',
      entryPoint: 'header',
      returnPath: '/',
      $current_url: '/',
    })
  })
})
