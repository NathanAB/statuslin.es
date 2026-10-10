import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { type BrowserCopyTracking, requestCopyIdentity } from '@/lib/copy-identity.server'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { findCopiedConfig, recordCopy } from './copy'
import { type CopyKind, copyEvent } from './copy-event'

// Anonymous (no auth check) — deliberate: anyone can copy. copyCount is an approximate popularity
// signal, deduped per client so it can't be trivially inflated from a single host (IP rotation or
// many accounts can still move it).
export const recordCopyFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { configId: string; kind: CopyKind } & BrowserCopyTracking) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const [{ ipHash, ...tracking }, config] = await Promise.all([
        requestCopyIdentity(data),
        findCopiedConfig(db, data.configId),
      ])
      // North Star metric: fire the copy event SERVER-SIDE so ad blockers can't strip it. The
      // browser's PostHog id joins the copy to the View→Copy funnel; without one the pseudonymous
      // ipHash still counts an ad-blocked copy under a stable per-client id. This fires on every
      // copy action, independent of recordCopy's per-IP dedup on the display count.
      const event = copyEvent({ kind: data.kind, configId: data.configId, config, ...tracking })
      if (event) getPostHogClient()?.capture(event)
      return recordCopy(db, data.configId, ipHash)
    }),
  )
