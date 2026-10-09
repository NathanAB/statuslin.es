import { createHmac } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { requireStrongSecret } from '@/lib/env'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { type InstallCommandKind, modCopyEvent } from './install'
import { getModDetail, recordModCopy } from './queries'

export const getModDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(({ data }) => withHttpStatus(() => getModDetail(db, data.slug)))

// Same keyed IP pseudonym as config copies (src/adopt/functions.ts), so one person dedupes the same
// way on both counters. Duplicated because src/adopt is closed to this change.
function resolveIpHash(ip: string | null): string | null {
  if (ip === null && process.env.NODE_ENV === 'production') return null
  return createHmac('sha256', requireStrongSecret('BETTER_AUTH_SECRET'))
    .update(`copy-dedup:${ip ?? 'local-dev'}`)
    .digest('hex')
}

/** Anonymous on purpose, like config copies: anyone can copy an install command. */
export const recordModCopyFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { modId: string; kind: InstallCommandKind; distinctId?: string; sessionId?: string }) => d,
  )
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const ipHash = resolveIpHash(getRequestHeaders().get('fly-client-ip'))
      const event = modCopyEvent({
        kind: data.kind,
        modId: data.modId,
        distinctId: data.distinctId ?? ipHash,
        sessionId: data.sessionId,
      })
      if (event) getPostHogClient()?.capture(event)
      return recordModCopy(db, data.modId, ipHash)
    }),
  )
