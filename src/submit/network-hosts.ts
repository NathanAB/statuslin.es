import { parse } from 'tldts'
import { HttpError } from '@/lib/http'

/** Max declared hosts per submission. */
export const MAX_NETWORK_HOSTS = 4

/** A DNS label: starts/ends alphanumeric, hyphens allowed inside. */
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/** True when `host` sits on an ICANN public suffix and is a registrable domain (or sub-host of
 * one). Requiring ICANN (not merely "registrable under the private section") rejects in one rule:
 *  - bare public suffixes (`com`, `github.io`) → domain is null
 *  - private/shared-tenant suffixes (`github.io`, `web.app`, `s3.amazonaws.com`) → isIcann false
 *  - special-use / internal TLDs (`internal`, `local`, `lan`, `localhost`) → isIcann false
 *  - IP literals → isIp true
 * `espn.com` / `site.api.espn.com` / `wttr.in` → true. `mypage.github.io` / `metadata.google.internal` → false. */
function isAllowedHostBase(host: string): boolean {
  if (host.includes(':') || host.includes('/')) return false
  const labels = host.split('.')
  if (labels.length < 2) return false
  if (!labels.every((l) => LABEL.test(l))) return false
  // No IDN / punycode in v1 — keep what the admin reviews unambiguous.
  if (labels.some((l) => l.startsWith('xn--'))) return false
  const r = parse(host, { allowPrivateDomains: true })
  if (r.isIp) return false
  // domain === null covers a host that IS a public suffix — bare (com) or multi-label (co.uk,
  // github.io) — since there's no registrable label in front of the suffix.
  if (r.domain === null) return false
  if (!r.isIcann) return false // private-section + special-use suffixes (github.io, .internal, .local)
  return true
}

function validateOne(host: string): string {
  if (host.includes('://')) throw new HttpError(400, `Host must not include a scheme: ${host}`)
  if (host.includes('/')) throw new HttpError(400, `Host must not include a path: ${host}`)
  if (host.includes(':')) throw new HttpError(400, `Host must not include a port: ${host}`)

  if (host.startsWith('*.')) {
    const rest = host.slice(2)
    if (rest.includes('*'))
      throw new HttpError(400, `Only a single leading wildcard is allowed: ${host}`)
    if (!isAllowedHostBase(rest))
      throw new HttpError(400, `A wildcard must sit on a registrable ICANN domain: ${host}`)
    return host
  }
  if (host.includes('*')) throw new HttpError(400, `A wildcard must be a leading *.label: ${host}`)
  if (!isAllowedHostBase(host)) throw new HttpError(400, `Not an allowed hostname: ${host}`)
  return host
}

/** Validate + normalize a declared host list. Returns the cleaned list or throws HttpError(400). */
export function validateNetworkHosts(raw: string[]): string[] {
  const cleaned: string[] = []
  for (const entry of raw) {
    const host = entry.trim().toLowerCase()
    if (host === '') continue
    if (!cleaned.includes(host)) cleaned.push(validateOne(host))
  }
  if (cleaned.length > MAX_NETWORK_HOSTS)
    throw new HttpError(400, `At most ${MAX_NETWORK_HOSTS} network hosts are allowed`)
  return cleaned
}
