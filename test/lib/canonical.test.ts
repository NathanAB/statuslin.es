import { afterEach, describe, expect, it } from 'vitest'
import { canonicalLink } from '@/lib/canonical'

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
