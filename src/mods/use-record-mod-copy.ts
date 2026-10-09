import { usePostHog } from '@posthog/react'
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
    let tracking: { distinctId?: string; sessionId?: string } = {}
    try {
      tracking = { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id() }
    } catch {
      // PostHog is uninitialized outside production; record without funnel ids.
    }
    recordModCopyFn({ data: { modId, kind, ...tracking } }).catch(() => {})
  }
}
