// Node socket errors a browser tab-close surfaces: connection reset, broken pipe.
const DISCONNECT_CODES = new Set(['ECONNRESET', 'EPIPE'])
// A cancelled fetch/stream raises this name; srvx uses `HTTPError` with message `aborted`.
const DISCONNECT_NAMES = new Set(['AbortError'])
// Cap the cause walk so a self-referential chain can never spin inside an error handler.
const MAX_CAUSE_DEPTH = 4

/**
 * True when an error is a benign client disconnect — the browser closed the connection before the
 * server finished (e.g. a tab closed mid `posthog-js` flush against the `/ingest` proxy). These are
 * not crashes: nothing broke for the visitor, so they must not reach error tracking. Genuine 500s
 * carry none of these markers and still pass through. Walks the `cause` chain because Nitro/H3 wraps
 * the original error. Pure and defensive — it runs inside an error handler and must never throw.
 */
export function isClientDisconnect(error: unknown, depth = 0): boolean {
  if (error === null || typeof error !== 'object' || depth > MAX_CAUSE_DEPTH) return false
  const e = error as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown }
  const name = typeof e.name === 'string' ? e.name : ''
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''

  if (DISCONNECT_NAMES.has(name)) return true
  if (DISCONNECT_CODES.has(code)) return true
  if (name === 'HTTPError' && message === 'aborted') return true

  return isClientDisconnect(e.cause, depth + 1)
}
