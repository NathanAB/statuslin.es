import { createHmac } from 'node:crypto'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { requireStrongSecret } from './env'

/** The browser's PostHog ids, passed through so a server-fired copy event joins its funnel. */
export interface BrowserCopyTracking {
  distinctId?: string
  sessionId?: string
}

export interface CopyIdentity {
  /** The per-client dedup key. Null when the copy should not be counted. */
  ipHash: string | null
  /** Who the PostHog event is attributed to: the browser's id, else the IP pseudonym. */
  distinctId: string | null
  sessionId: string | undefined
}

// Turn the client IP into a one-way keyed token so the DB never stores a raw IP. HMAC with
// BETTER_AUTH_SECRET, domain-separated via "copy-dedup:" so it can't collide with cookie signing.
// Reversing it needs the server secret, so the stored value is a pseudonym, not the address.
// (Rotating that secret resets dedup buckets — acceptable for an approximate counter.)
function hashIp(ip: string): string {
  return createHmac('sha256', requireStrongSecret('BETTER_AUTH_SECRET'))
    .update(`copy-dedup:${ip}`)
    .digest('hex')
}

// Fly's proxy sets Fly-Client-IP from the real edge connection and clients can't forge it (unlike
// X-Forwarded-For). If it's absent — which shouldn't happen behind Fly's proxy — count nothing in
// production (null) rather than collapse every such request into one shared bucket; locally, use a
// dev bucket so the flow still works.
function resolveIpHash(ip: string | null): string | null {
  if (ip !== null) return hashIp(ip)
  return process.env.NODE_ENV === 'production' ? null : hashIp('local-dev')
}

/**
 * The identity of one copy request, shared by config and mod copies so one visitor dedupes and
 * attributes the same way on both counters. Reads the request, so it only runs inside a handler.
 */
export function requestCopyIdentity(browser: BrowserCopyTracking): CopyIdentity {
  const ipHash = resolveIpHash(getRequestHeaders().get('fly-client-ip'))
  return { ipHash, distinctId: browser.distinctId ?? ipHash, sessionId: browser.sessionId }
}
