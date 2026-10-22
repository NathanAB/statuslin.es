import { usePostHog } from '@posthog/react'
import type { CopySurface } from '@/lib/copy-surface'
import { browserFunnelIds } from '@/lib/posthog-funnel-ids'
import { type CountedCopy, useCountedCopy } from '@/lib/use-counted-copy'
import { recordModCopyFn } from './functions'
import type { InstallCommandKind } from './install'

/**
 * A mod's copy count, counted like a status line's. The PostHog event fires server-side, where ad
 * blockers can't strip it, with the browser's PostHog ids so it joins this visitor's funnel.
 */
export function useRecordModCopy(
  modId: string,
  copyCount: number,
  surface: CopySurface = 'page',
): CountedCopy<InstallCommandKind> {
  const posthog = usePostHog()
  return useCountedCopy(modId, copyCount, (kind: InstallCommandKind) =>
    recordModCopyFn({ data: { modId, kind, surface, ...browserFunnelIds(posthog) } }),
  )
}
