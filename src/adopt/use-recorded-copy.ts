import { usePostHog } from '@posthog/react'
import { useState } from 'react'
import type { CopyKind } from '@/adopt/copy-event'
import { recordCopyFn } from '@/adopt/functions'

/**
 * Shared copy-and-record logic for adopt controls: clipboard write → optimistic
 * count bump → server reconcile (only a positive total is adopted, so an
 * unpublished/missing config returning 0 doesn't regress the display).
 *
 * The PostHog copy event fires server-side (in recordCopyFn), not here — ad blockers can't strip a
 * server event, and copies are the North Star metric. We pass the browser's distinct + session ids
 * through so the server event still joins the same person's View→Copy funnel.
 */
export function useRecordedCopy(configId: string, copyCount: number) {
  const posthog = usePostHog()
  const [count, setCount] = useState(copyCount)

  async function record(kind: CopyKind) {
    setCount((c) => c + 1)
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
      if (next > 0) setCount(next)
    } catch {
      // Network/server error — keep the optimistic value.
    }
  }

  /** Writes `text` to the clipboard; on success calls `onCopied` and records the copy. */
  function copy(text: string, kind: CopyKind, onCopied: () => void) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        onCopied()
        void record(kind)
      })
      .catch(() => {
        // Clipboard denied/unavailable — don't claim "Copied!" or bump the count.
      })
  }

  return { count, copy }
}
