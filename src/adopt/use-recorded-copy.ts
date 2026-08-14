import { usePostHog } from '@posthog/react'
import { useRef, useState } from 'react'
import type { CopyKind } from '@/adopt/copy-event'
import { recordCopyFn } from '@/adopt/functions'

export interface RecordedCopyController {
  count: number
  record: (kind: CopyKind) => void
}

/**
 * Shared record-and-reconcile logic for adopt controls: optimistic count bump →
 * server reconcile (only a positive total is adopted, so an unpublished/missing
 * config returning 0 doesn't regress the display). Callers write the clipboard
 * themselves (CopyButton) and invoke `record` only after a successful write.
 *
 * The PostHog copy event fires server-side (in recordCopyFn), not here — ad blockers can't strip a
 * server event, and copies are the North Star metric. We pass the browser's distinct + session ids
 * through so the server event still joins the same person's View→Copy funnel.
 */
export function useRecordedCopy(configId: string, copyCount: number): RecordedCopyController {
  const posthog = usePostHog()
  const activeConfigId = useRef(configId)
  activeConfigId.current = configId
  const authoritativeCount = useRef<{ configId: string; count: number | null }>({
    configId,
    count: null,
  })
  if (authoritativeCount.current.configId !== configId) {
    authoritativeCount.current = { configId, count: null }
  }
  const [state, setState] = useState({ configId, count: copyCount })
  if (state.configId !== configId) {
    setState({ configId, count: copyCount })
  }
  const count = state.configId === configId ? Math.max(state.count, copyCount) : copyCount

  async function record(kind: CopyKind) {
    const requestConfigId = configId
    setState((current) => ({
      configId: requestConfigId,
      count:
        (current.configId === requestConfigId ? Math.max(current.count, copyCount) : copyCount) + 1,
    }))
    // Best-effort PostHog ids so the server-side copy event can join this person's funnel. When
    // analytics is off (non-prod), the instance is uninitialized and these can be undefined or
    // throw — never let that stop the copy from being recorded.
    let tracking: { distinctId?: string; sessionId?: string } = {}
    try {
      tracking = { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id() }
    } catch {
      // PostHog not initialized — record the copy without funnel ids.
    }
    try {
      const next = await recordCopyFn({ data: { configId, kind, ...tracking } })
      // recordCopy returns 0 for a malformed/missing/unpublished config — don't let
      // that regress the display. copyCount is an approximate signal, so we keep the
      // optimistic value and only adopt a positive server total.
      if (next > 0 && activeConfigId.current === requestConfigId) {
        const previous = authoritativeCount.current.count
        const reconciled = previous === null ? next : Math.max(previous, next)
        authoritativeCount.current = { configId: requestConfigId, count: reconciled }
        setState((current) =>
          current.configId === requestConfigId ? { ...current, count: reconciled } : current,
        )
      }
    } catch {
      // Network/server error — keep the optimistic value.
    }
  }

  return { count, record }
}
