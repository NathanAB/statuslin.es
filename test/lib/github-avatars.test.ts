import { describe, expect, it } from 'vitest'
import { githubAvatarUrl } from '@/lib/github-avatars'

describe('githubAvatarUrl', () => {
  it("points at the GitHub user's avatar by login, sized for a 20px chip at 2x", () => {
    expect(githubAvatarUrl('octocat')).toBe('https://avatars.githubusercontent.com/octocat?s=40')
  })

  it('escapes the login', () => {
    expect(githubAvatarUrl('a b')).toBe('https://avatars.githubusercontent.com/a%20b?s=40')
  })
})
