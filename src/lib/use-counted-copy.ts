import { useRef, useState } from 'react'

/** The copy count an install control shows, and how it records a copy. */
export interface CountedCopy<Kind> {
  count: number
  record: (kind: Kind) => void
}

/**
 * Record-and-reconcile logic shared by status line and mod pages: optimistic count bump → server
 * reconcile (only a positive total is adopted, so an unpublished/missing item returning 0 doesn't
 * regress the display). Callers write the clipboard themselves (CopyButton) and invoke `record`
 * only after a successful write. `send` records one copy of item `id` and resolves to its total.
 */
export function useCountedCopy<Kind>(
  id: string,
  copyCount: number,
  send: (kind: Kind) => Promise<number>,
): CountedCopy<Kind> {
  const activeId = useRef(id)
  activeId.current = id
  const authoritativeCount = useRef<{ id: string; count: number | null }>({ id, count: null })
  if (authoritativeCount.current.id !== id) {
    authoritativeCount.current = { id, count: null }
  }
  const [state, setState] = useState({ id, count: copyCount })
  if (state.id !== id) {
    setState({ id, count: copyCount })
  }
  const count = state.id === id ? Math.max(state.count, copyCount) : copyCount

  async function record(kind: Kind) {
    const requestId = id
    setState((current) => ({
      id: requestId,
      count: (current.id === requestId ? Math.max(current.count, copyCount) : copyCount) + 1,
    }))
    try {
      const next = await send(kind)
      // The server returns 0 for a malformed/missing/unpublished item — don't let that regress
      // the display. copyCount is an approximate signal, so we keep the optimistic value and only
      // adopt a positive server total.
      if (next > 0 && activeId.current === requestId) {
        const previous = authoritativeCount.current.count
        const reconciled = previous === null ? next : Math.max(previous, next)
        authoritativeCount.current = { id: requestId, count: reconciled }
        setState((current) =>
          current.id === requestId ? { ...current, count: reconciled } : current,
        )
      }
    } catch {
      // Network/server error — keep the optimistic value.
    }
  }

  return { count, record }
}
