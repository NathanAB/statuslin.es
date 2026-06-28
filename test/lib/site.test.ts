import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteUrl } from '@/lib/site'

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
  vi.unstubAllGlobals() // clear any stubbed window so the next test runs server-side again
})

describe('siteUrl', () => {
  it('on the server, returns the BETTER_AUTH_URL origin without a trailing slash', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es/'
    expect(siteUrl()).toBe('https://statuslin.es')
  })
  it('on the server, passes a no-trailing-slash origin through unchanged', () => {
    process.env.BETTER_AUTH_URL = 'http://localhost:3000'
    expect(siteUrl()).toBe('http://localhost:3000')
  })
  it('on the client, returns window.location.origin and never reads the env var', () => {
    // head() runs on the client during navigation; the browser bundle has no BETTER_AUTH_URL,
    // so reading it there would throw. Empty the env var to prove the client branch ignores it.
    vi.stubGlobal('window', { location: { origin: 'https://statuslin.es' } })
    process.env.BETTER_AUTH_URL = ''
    expect(siteUrl()).toBe('https://statuslin.es')
  })
})
