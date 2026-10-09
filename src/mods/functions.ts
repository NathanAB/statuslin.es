import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { type BrowserCopyTracking, requestCopyIdentity } from '@/lib/copy-identity.server'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { type InstallCommandKind, modCopyEvent } from './install'
import { getModDetail, recordModCopy } from './queries'

export const getModDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(({ data }) => withHttpStatus(() => getModDetail(db, data.slug)))

/** Anonymous on purpose, like config copies: anyone can copy an install command. */
export const recordModCopyFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { modId: string; kind: InstallCommandKind } & BrowserCopyTracking) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const { ipHash, ...tracking } = requestCopyIdentity(data)
      const event = modCopyEvent({ kind: data.kind, modId: data.modId, ...tracking })
      if (event) getPostHogClient()?.capture(event)
      return recordModCopy(db, data.modId, ipHash)
    }),
  )
