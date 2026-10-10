import { usePostHog } from '@posthog/react'
import { browserFunnelIds } from '@/lib/posthog-funnel-ids'
import { recordModCopyFn } from './functions'
import type { InstallCommandKind } from './install'

/**
 * Records a copy server-side, where the PostHog event fires (ad blockers can't strip it), passing
 * the browser's PostHog ids so it joins this visitor's funnel. Best effort: a failure never
 * interrupts the copy.
 */
export function useRecordModCopy(modId: string): (kind: InstallCommandKind) => void {
  const posthog = usePostHog()
  return (kind) => {
    recordModCopyFn({ data: { modId, kind, ...browserFunnelIds(posthog) } }).catch(() => {})
  }
}
