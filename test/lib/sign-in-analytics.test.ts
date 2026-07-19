// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { social: vi.fn().mockResolvedValue(undefined) } },
}))

const { consumePendingAuthIntent, startGitHubSignIn } = await import('@/lib/sign-in')

beforeEach(() => window.sessionStorage.clear())

describe('startGitHubSignIn analytics context', () => {
  it('stores the pending entry point across the OAuth redirect', () => {
    startGitHubSignIn('/submit', 'submit')

    expect(JSON.parse(window.sessionStorage.getItem('statuslines.pending-auth') ?? 'null')).toEqual(
      {
        entryPoint: 'submit',
        returnPath: '/submit',
      },
    )
  })

  it('consumes a valid pending intent once', () => {
    startGitHubSignIn('/c/example', 'upvote')

    expect(consumePendingAuthIntent()).toEqual({
      entryPoint: 'upvote',
      returnPath: '/c/example',
    })
    expect(consumePendingAuthIntent()).toBeNull()
  })

  it('drops malformed pending intent data', () => {
    window.sessionStorage.setItem(
      'statuslines.pending-auth',
      JSON.stringify({ entryPoint: 'unknown', returnPath: '/submit' }),
    )

    expect(consumePendingAuthIntent()).toBeNull()
    expect(window.sessionStorage.getItem('statuslines.pending-auth')).toBeNull()
  })
})
