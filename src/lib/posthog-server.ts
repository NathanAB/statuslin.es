import { PostHog } from 'posthog-node'

let posthogClient: PostHog | null = null
let warnedMissingToken = false

/**
 * Lazily build the server-side PostHog client, or return null when the project token isn't set in
 * the runtime env. Analytics is best-effort: a missing token must never throw inside — and so 500 —
 * a real mutation (copy recording, admin approve/reject). Callers use `getPostHogClient()?.capture`.
 */
export function getPostHogClient(): PostHog | null {
  const token = process.env.POSTHOG_PROJECT_TOKEN
  if (!token) {
    if (!warnedMissingToken) {
      warnedMissingToken = true
      // biome-ignore lint/suspicious/noConsole: one-time warning that server analytics is disabled
      console.warn('[posthog] POSTHOG_PROJECT_TOKEN not set — server analytics disabled')
    }
    return null
  }
  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return posthogClient
}

/**
 * A built server-side analytics event, ready to hand to {@link captureServerEvent}. Pure event
 * builders (e.g. submittedEvent, voteEvent) return this so the mapping from a domain result to
 * event name + attribution + properties is unit-testable without a live PostHog client.
 */
export interface ServerEvent {
  /** Who the event is attributed to — the signed-in user's id (PostHog identifies on user.id). */
  distinctId: string
  /** PostHog event name, e.g. 'statusline_submitted'. */
  event: string
  /** Queryable custom properties for the event. */
  properties: Record<string, unknown>
}

/** Context attached to a server-side error capture. Only safe, non-script metadata belongs here. */
export type ServerErrorContext = {
  /** Defaults to the constant `'server'`; error tracking groups by fingerprint, not person. */
  distinctId?: string
  /** Coarse origin tag: 'ssr' | 'server-fn' | 'worker' | 'uncaught'. */
  source?: string
  /** Allowlist of safe fields (path, status, …) — NEVER submitted-script bytes. See the spec. */
  properties?: Record<string, unknown>
}

// One error can bubble to more than one capture point (a server-fn throw reaching both
// withHttpStatus and the Nitro `error` hook). Mark the error object the first time we send it so
// the second path doesn't double-count. Symbol.for keeps the marker stable across module reloads.
const CAPTURED = Symbol.for('statuslines.serverExceptionCaptured')

function markCapturedOnce(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return true // primitives can't be marked — always send
  const marked = error as Record<symbol, unknown>
  if (marked[CAPTURED]) return false
  try {
    marked[CAPTURED] = true
  } catch {
    // frozen/exotic object — can't mark, so just allow the send rather than suppress it
  }
  return true
}

function serverErrorProperties(ctx?: ServerErrorContext): Record<string, unknown> {
  return {
    // The flag the email alert filters on — isolates server-side captures from the browser
    // `$exception` events posthog-js sends. Plain camelCase (not a `$`-reserved name) so PostHog
    // keeps it as a queryable custom property and the repo's naming lint stays happy.
    serverException: true,
    ...(ctx?.source ? { source: ctx.source } : {}),
    ...ctx?.properties,
  }
}

/**
 * Capture a non-error server event in PostHog. Fire-and-forget (the client flushes immediately),
 * fail-soft (missing token or any client error is swallowed — telemetry must never crash the
 * worker or 500 a request). The counterpart to captureServerException for plain events.
 */
export function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const client = getPostHogClient()
    if (!client) return
    client.capture({ event, distinctId, ...(properties ? { properties } : {}) })
  } catch {
    // telemetry must never throw — swallow
  }
}

/**
 * Capture a server-side exception in PostHog. Fire-and-forget (the client flushes immediately).
 * Fail-soft: a missing token or any client error is swallowed — error reporting must never be the
 * thing that 500s a request or crashes the worker. Deduped per error object across capture points.
 */
export function captureServerException(error: unknown, ctx?: ServerErrorContext): void {
  try {
    const client = getPostHogClient()
    if (!client) return
    if (!markCapturedOnce(error)) return
    client.captureException(error, ctx?.distinctId ?? 'server', serverErrorProperties(ctx))
  } catch {
    // error reporting must never throw — swallow
  }
}

/**
 * Awaited variant for paths that exit right after capturing (the worker's fatal handlers), where a
 * fire-and-forget send would be lost when the process dies before the flush. Otherwise identical to
 * {@link captureServerException}: fail-soft, deduped, off when there's no token.
 */
export async function captureServerExceptionImmediate(
  error: unknown,
  ctx?: ServerErrorContext,
): Promise<void> {
  try {
    const client = getPostHogClient()
    if (!client) return
    if (!markCapturedOnce(error)) return
    await client.captureExceptionImmediate(
      error,
      ctx?.distinctId ?? 'server',
      serverErrorProperties(ctx),
    )
  } catch {
    // error reporting must never throw — swallow
  }
}
