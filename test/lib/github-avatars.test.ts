import { describe, expect, it } from 'vitest'
import { chipAvatarUrl, githubAvatarUrl } from '@/lib/github-avatars'

describe('githubAvatarUrl', () => {
  it("points at the GitHub user's avatar by login, sized for a 20px chip at 2x", () => {
    expect(githubAvatarUrl('octocat')).toBe('https://avatars.githubusercontent.com/octocat?s=40')
  })

  it('escapes the login', () => {
    expect(githubAvatarUrl('a b')).toBe('https://avatars.githubusercontent.com/a%20b?s=40')
  })
})

// A GitHub sign-in stores the avatar at full size (460px); it shows in a 20px circle.
describe('chipAvatarUrl', () => {
  it('asks GitHub for the avatar at the size the chip shows it', () => {
    expect(chipAvatarUrl('https://avatars.githubusercontent.com/u/6635302?v=4')).toBe(
      'https://avatars.githubusercontent.com/u/6635302?v=4&s=40',
    )
  })

  it('leaves an avatar already sized, and one from anywhere else, as it is', () => {
    expect(chipAvatarUrl('https://avatars.githubusercontent.com/octocat?s=40')).toBe(
      'https://avatars.githubusercontent.com/octocat?s=40',
    )
    expect(chipAvatarUrl('https://example.test/me.png')).toBe('https://example.test/me.png')
    expect(chipAvatarUrl('not a url')).toBe('not a url')
  })
})
