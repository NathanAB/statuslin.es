import { CONTACT_EMAIL, REPO_URL } from '@/lib/site'

/**
 * RFC 9116 security.txt body, served at /.well-known/security.txt so researchers
 * find the contact + policy without guessing. Built from the single-source site
 * constants so the contact never drifts from the footer / SECURITY.md.
 *
 * `Expires` is required by the RFC and must be a future date — refresh it before
 * 2027-06-20 (the spec wants it under a year out).
 */
export const SECURITY_TXT = [
  `Contact: mailto:${CONTACT_EMAIL}`,
  'Expires: 2027-06-20T00:00:00.000Z',
  `Policy: ${REPO_URL}/blob/main/SECURITY.md`,
  'Preferred-Languages: en',
  '',
].join('\n')

/**
 * The `/.well-known/security.txt` HTTP response. `Cache-Control: max-age=86400`
 * keeps a CDN from pinning a stale copy past `Expires` — a one-day window means an
 * Expires refresh (or contact change) propagates within a day.
 */
export function securityTxtResponse(): Response {
  return new Response(SECURITY_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400',
    },
  })
}
