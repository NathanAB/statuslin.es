import { afterEach, describe, expect, it } from 'vitest'
import { canonicalLink, homeCanonicalPath } from '@/lib/canonical'

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
})

describe('canonicalLink', () => {
  it('emits a rel=canonical link for a sub-path', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    expect(canonicalLink('/c/my-line')).toEqual({
      rel: 'canonical',
      href: 'https://statuslin.es/c/my-line',
    })
  })

  it('points the home path at the bare origin (no trailing slash)', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    expect(canonicalLink('/')).toEqual({ rel: 'canonical', href: 'https://statuslin.es' })
  })
})

describe('homeCanonicalPath', () => {
  it('is the bare home path for page 1', () => {
    expect(homeCanonicalPath(1)).toBe('/')
  })
  it('self-canonicals deeper pages with only the page param', () => {
    expect(homeCanonicalPath(2)).toBe('/?page=2')
    expect(homeCanonicalPath(3)).toBe('/?page=3')
  })
})
