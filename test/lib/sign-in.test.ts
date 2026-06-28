import { afterEach, describe, expect, it, vi } from 'vitest'

// Spy on the Better Auth social sign-in so we can assert the redirect args without a network call.
const socialSignIn = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: (opts: unknown) => socialSignIn(opts) } },
}))

const { startGitHubSignIn } = await import('@/lib/sign-in')

afterEach(() => socialSignIn.mockClear())

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
})
