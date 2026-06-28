import { createHmac } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { requireStrongSecret } from '@/lib/env'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { recordCopy } from './copy'
import { type CopyKind, copyEvent } from './copy-event'

// Turn the client IP into a one-way keyed token so the DB never stores a raw IP. HMAC with
// BETTER_AUTH_SECRET, domain-separated via "copy-dedup:" so it can't collide with cookie signing.
// Reversing it needs the server secret, so the stored value is a pseudonym, not the address.
// (Rotating that secret resets dedup buckets — acceptable for an approximate counter.)
function hashIp(ip: string): string {
  return createHmac('sha256', requireStrongSecret('BETTER_AUTH_SECRET'))
    .update(`copy-dedup:${ip}`)
    .digest('hex')
}

// Resolve the dedup key from the request. Fly's proxy sets Fly-Client-IP from the real edge
// connection and clients can't forge it (unlike X-Forwarded-For). If it's absent — which shouldn't
// happen behind Fly's proxy — count nothing in production (null) rather than collapse every such
// request into one shared bucket; locally, use a dev bucket so the flow still works.
function resolveIpHash(ip: string | null): string | null {
  if (ip !== null) return hashIp(ip)
  return process.env.NODE_ENV === 'production' ? null : hashIp('local-dev')
}

// Anonymous (no auth check) — deliberate: anyone can copy. copyCount is an approximate popularity
// signal, deduped per client so it can't be trivially inflated from a single host (IP rotation or
// many accounts can still move it).
export const recordCopyFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { configId: string; kind: CopyKind; distinctId?: string; sessionId?: string }) => d,
  )
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const ipHash = resolveIpHash(getRequestHeaders().get('fly-client-ip'))
      // North Star metric: fire the copy event SERVER-SIDE so ad blockers can't strip it. Prefer the
      // browser's PostHog distinct id (so the copy joins the View→Copy funnel); fall back to the
      // pseudonymous ipHash so an ad-blocked copy is still counted under a stable per-client id. This
      // fires on every copy action, independent of recordCopy's per-IP dedup on the display count.
      const event = copyEvent({
        kind: data.kind,
        configId: data.configId,
        distinctId: data.distinctId ?? ipHash,
        sessionId: data.sessionId,
      })
      if (event) getPostHogClient()?.capture(event)
      return recordCopy(db, data.configId, ipHash)
    }),
  )
