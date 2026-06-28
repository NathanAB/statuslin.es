import { describe, expect, it } from 'vitest'
import { HttpError } from '@/lib/http'
import { MAX_NETWORK_HOSTS, validateNetworkHosts } from '@/submit/network-hosts'

describe('validateNetworkHosts', () => {
  it('accepts an exact hostname', () => {
    expect(validateNetworkHosts(['wttr.in'])).toEqual(['wttr.in'])
  })
  it('accepts a deep exact hostname', () => {
    expect(validateNetworkHosts(['site.api.espn.com'])).toEqual(['site.api.espn.com'])
  })
  it('accepts a single-label wildcard on a registrable domain', () => {
    expect(validateNetworkHosts(['*.espn.com'])).toEqual(['*.espn.com'])
  })
  it('lowercases and trims, drops empties, de-duplicates', () => {
    expect(validateNetworkHosts(['  WTTR.in ', '', 'wttr.in'])).toEqual(['wttr.in'])
  })
  it('returns [] for an empty list', () => {
    expect(validateNetworkHosts([])).toEqual([])
  })

  it('rejects more than the cap', () => {
    const hosts = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com']
    expect(hosts.length).toBeGreaterThan(MAX_NETWORK_HOSTS)
    expect(() => validateNetworkHosts(hosts)).toThrow(HttpError)
  })
  it('rejects a scheme', () => {
    expect(() => validateNetworkHosts(['https://wttr.in'])).toThrow(HttpError)
  })
  it('rejects a path', () => {
    expect(() => validateNetworkHosts(['wttr.in/paris'])).toThrow(HttpError)
  })
  it('rejects a port', () => {
    expect(() => validateNetworkHosts(['wttr.in:443'])).toThrow(HttpError)
  })
  it('rejects a bare IP', () => {
    expect(() => validateNetworkHosts(['1.1.1.1'])).toThrow(HttpError)
  })
  it('rejects a bare label (no dot)', () => {
    expect(() => validateNetworkHosts(['localhost'])).toThrow(HttpError)
  })

  // Public-suffix wildcards — ICANN section
  it.each(['*.com', '*.io', '*.co.uk', '*'])('rejects ICANN public-suffix wildcard %s', (h) => {
    expect(() => validateNetworkHosts([h])).toThrow(HttpError)
  })
  // Wildcards on PRIVATE/shared-tenant suffixes — each subdomain is a different untrusted tenant.
  // The base of these is itself a public suffix (private section), so it's NOT an ICANN registrable
  // domain and must be rejected. `*.amazonaws.com` is NOT here: amazonaws.com IS a registrable
  // ICANN domain (owned by Amazon); the shared-tenant suffix is the deeper `s3.amazonaws.com`.
  it.each([
    '*.github.io',
    '*.workers.dev',
    '*.pages.dev',
    '*.web.app',
    '*.vercel.app',
    '*.netlify.app',
    '*.s3.amazonaws.com',
  ])('rejects shared-tenant suffix wildcard %s', (h) => {
    expect(() => validateNetworkHosts([h])).toThrow(HttpError)
  })
  // Internal / special-use TLDs resolve into private networks (metadata endpoints, LAN). Reject
  // both exact and wildcard regardless of E2B's IP deny — defense in depth against the SSRF path.
  it.each([
    'metadata.google.internal',
    'foo.local',
    'box.lan',
    'x.intranet',
    'host.corp',
    'localhost',
  ])('rejects internal/special-use host %s', (h) => {
    expect(() => validateNetworkHosts([h])).toThrow(HttpError)
  })
  it('rejects an exact host on a private/shared-tenant suffix (v1: ICANN suffixes only)', () => {
    expect(() => validateNetworkHosts(['mypage.github.io'])).toThrow(HttpError)
  })
  it('rejects a punycode / IDN label (out of scope for v1)', () => {
    expect(() => validateNetworkHosts(['xn--80ak6aa92e.com'])).toThrow(HttpError)
  })
  it('rejects a mid-host wildcard', () => {
    expect(() => validateNetworkHosts(['api.*.espn.com'])).toThrow(HttpError)
  })
})
