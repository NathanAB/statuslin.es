export type CopyKind = 'prompt' | 'script'

const EVENT_BY_KIND: Record<CopyKind, string> = {
  prompt: 'statusline_prompt_copied',
  script: 'statusline_script_copied',
}

// PostHog ties a server event back to the browser session via this exact property name. Held in a
// const so it's assigned through a variable key — neither the camelCase naming rule nor the
// literal-keys rule fires on the leading '$'.
const SESSION_ID_PROP = '$session_id'

/** A PostHog capture payload, structurally assignable to posthog-node's EventMessage. */
export interface CopyCaptureMessage {
  distinctId: string
  event: string
  properties: Record<string, unknown>
}

interface CopyEventInput {
  kind: CopyKind
  configId: string
  /** The browser's PostHog distinct id (or a server-side fallback). Null/empty when neither exists. */
  distinctId: string | null | undefined
  /** The browser's PostHog session id, so the server-fired event ties back to the same session. */
  sessionId?: string | null | undefined
}

/**
 * Build the PostHog event for a copy. Fired SERVER-SIDE (in recordCopyFn), not in the browser, so
 * ad blockers can't hide it — copies are the North Star metric. Returns null when there's no
 * distinct id to attribute the copy to (PostHog requires one); the caller then skips the capture.
 */
export function copyEvent(input: CopyEventInput): CopyCaptureMessage | null {
  if (!input.distinctId) return null
  // kind is attacker-controllable (the server fn input is a passthrough), so guard the lookup
  // against own properties only — an unknown kind like '__proto__' must not resolve to a value.
  if (!Object.hasOwn(EVENT_BY_KIND, input.kind)) return null
  const properties: Record<string, unknown> = { configId: input.configId }
  if (input.sessionId) properties[SESSION_ID_PROP] = input.sessionId
  return { distinctId: input.distinctId, event: EVENT_BY_KIND[input.kind], properties }
}
