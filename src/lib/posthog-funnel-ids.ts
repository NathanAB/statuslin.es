import type { PostHog } from 'posthog-js'

export interface FunnelIds {
  distinctId?: string
  sessionId?: string
}

/**
 * The browser's PostHog ids, passed to a server-side event so it joins this visitor's funnel.
 * Empty when PostHog is uninitialized (analytics is off outside production), where the getters
 * can throw: a missing id must never stop the event being recorded.
 */
export function browserFunnelIds(
  posthog: Pick<PostHog, 'get_distinct_id' | 'get_session_id'>,
): FunnelIds {
  try {
    return { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id() }
  } catch {
    return {}
  }
}
