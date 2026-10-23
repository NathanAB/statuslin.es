import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { type BrowserCopyTracking, requestCopyIdentity } from '@/lib/copy-identity.server'
import type { CopySurface } from '@/lib/copy-surface'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { getModDesktopShot } from './desktop-shot'
import { type InstallCommandKind, modCopyEvent } from './install'
import { getModDetail, recordModCopy } from './queries'
import { getModRelated, getStatusLineMods } from './related'

export const getModDetailFn = createServerFn({ method: 'GET' })
  .validator((d: { slug: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const mod = await getModDetail(db, data.slug)
      return mod && { ...mod, related: await getModRelated(db, mod) }
    }),
  )

/** The mods a status line page links to, from the status line's tags. */
export const getStatusLineModsFn = createServerFn({ method: 'GET' })
  // Only registry tags, once each: a caller can't grow the query past the registry's size.
  .validator((d: { tags: string[] }) => ({
    tags: Array.isArray(d.tags) ? [...new Set(d.tags)].filter((tag) => FACET_BY_SLUG.has(tag)) : [],
  }))
  .handler(({ data }) => withHttpStatus(() => getStatusLineMods(db, data)))

/** Only what a guide needs to link a mod: whether it is published, and its Desktop shot. */
export const getModDesktopShotFn = createServerFn({ method: 'GET' })
  .validator((d: { slug: string }) => d)
  .handler(({ data }) => withHttpStatus(() => getModDesktopShot(db, data.slug)))

/** Anonymous on purpose, like config copies: anyone can copy an install command. */
export const recordModCopyFn = createServerFn({ method: 'POST' })
  .validator(
    (d: { modId: string; kind: InstallCommandKind; surface?: CopySurface } & BrowserCopyTracking) =>
      d,
  )
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const { ipHash, ...tracking } = await requestCopyIdentity(data)
      const event = modCopyEvent({
        kind: data.kind,
        modId: data.modId,
        surface: data.surface,
        ...tracking,
      })
      if (event) getPostHogClient()?.capture(event)
      return recordModCopy(db, data.modId, ipHash)
    }),
  )
