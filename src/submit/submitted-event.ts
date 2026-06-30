import type { ServerEvent } from '@/lib/posthog-server'

interface SubmittedEventInput {
  /** The submitting user's id — PostHog identifies signed-in users on user.id (see __root.tsx). */
  userId: string
  interpreter: string
  slug: string
}

/**
 * Build the PostHog event for a successful submission. Fired SERVER-SIDE (in submitConfigFn), not
 * in the browser, so ad blockers can't strip it — the same reasoning the copy event already
 * follows. Submissions are signed-in only, so the user id is always present and joins the person's
 * funnel directly (no anonymous distinct-id fallback needed, unlike the anonymous copy flow).
 */
export function submittedEvent(input: SubmittedEventInput): ServerEvent {
  return {
    distinctId: input.userId,
    event: 'statusline_submitted',
    properties: { interpreter: input.interpreter, slug: input.slug },
  }
}
