import type { ServerErrorContext } from '@/lib/posthog-server'

/**
 * The slice of Nitro's `CapturedErrorContext` we read. Typed structurally (not against h3's full
 * `HTTPEvent`) so it stays trivially unit-testable — the real hook passes a superset of this.
 */
type NitroErrorContext = {
  event?: { req?: { url?: string; method?: string } }
  tags?: string[]
}

// Nitro routes process-level crashes through the same `error` hook, tagged like this.
const PROCESS_LEVEL_TAGS = new Set(['uncaughtException', 'unhandledRejection'])

/**
 * Map a Nitro error-hook context to our `ServerErrorContext`, attaching ONLY safe metadata
 * (request path, method, Nitro tags) — never a request body or any submitted-script bytes. Pure and
 * defensive: extracting metadata inside an error handler must never throw.
 */
export function serverErrorContextFromNitro(ctx?: NitroErrorContext): ServerErrorContext {
  const tags = ctx?.tags ?? []
  const source = tags.some((t) => PROCESS_LEVEL_TAGS.has(t)) ? 'uncaught' : 'ssr'

  const properties: Record<string, unknown> = {}
  const rawUrl = ctx?.event?.req?.url
  if (rawUrl) {
    try {
      // req.url is an absolute request URL; keep the path only (drop scheme/host/query string).
      properties.path = new URL(rawUrl).pathname
    } catch {
      // unparseable url — omit the path rather than throw inside an error handler
    }
  }
  const method = ctx?.event?.req?.method
  if (method) properties.method = method
  if (tags.length) properties.tags = tags

  return { source, properties }
}
