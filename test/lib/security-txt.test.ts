import { describe, expect, it } from 'vitest'

import { SECURITY_TXT, securityTxtResponse } from '@/lib/security-txt'
import { CONTACT_EMAIL } from '@/lib/site'

describe('security.txt (RFC 9116)', () => {
  it('has the required Contact field pointing at the contact email', () => {
    expect(SECURITY_TXT).toContain(`Contact: mailto:${CONTACT_EMAIL}`)
  })

  it('has the required Expires field as an ISO 8601 timestamp', () => {
    expect(SECURITY_TXT).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/m)
  })

  it('has an Expires date in the future (fails when it needs refreshing)', () => {
    const match = SECURITY_TXT.match(/^Expires: (.+)$/m)
    expect(match).not.toBeNull()
    expect(new Date(match?.[1] ?? '').getTime()).toBeGreaterThan(Date.now())
  })

  it('points to a Policy URL over https', () => {
    expect(SECURITY_TXT).toMatch(/^Policy: https:\/\/\S+/m)
  })
})

describe('securityTxtResponse', () => {
  it('serves the body as text/plain with a cache header', async () => {
    const res = securityTxtResponse()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/plain/)
    expect(res.headers.get('cache-control')).toMatch(/max-age/)
    expect(await res.text()).toContain('Contact:')
  })
})
