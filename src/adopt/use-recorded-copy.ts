import { usePostHog } from '@posthog/react'
import type { CopyKind } from '@/adopt/copy-event'
import { recordCopyFn } from '@/adopt/functions'
import type { CopySurface } from '@/lib/copy-surface'
import { browserFunnelIds } from '@/lib/posthog-funnel-ids'
import { type CountedCopy, useCountedCopy } from '@/lib/use-counted-copy'

export type RecordedCopyController = CountedCopy<CopyKind>

/**
 * A status line's copy count. The PostHog copy event fires server-side (in recordCopyFn), not
 * here — ad blockers can't strip a server event, and copies are the North Star metric. We pass the
 * browser's distinct + session ids through so the server event still joins the same person's
 * View→Copy funnel.
 */
export function useRecordedCopy(
  configId: string,
  copyCount: number,
  surface: CopySurface = 'page',
): RecordedCopyController {
  const posthog = usePostHog()
  return useCountedCopy(configId, copyCount, (kind: CopyKind) =>
    recordCopyFn({ data: { configId, kind, surface, ...browserFunnelIds(posthog) } }),
  )
}
