import type { ServerEvent } from '@/lib/posthog-server'

interface ModSubmittedEventInput {
  /** The submitting user's id — PostHog identifies signed-in users on user.id (see __root.tsx). */
  userId: string
  slug: string
  modId: string
  versionId: string
  /** True for a new version of the submitter's published mod. */
  isUpdate: boolean
}

/**
 * The PostHog event for a submitted mod, fired server-side like statusline_submitted. versionId
 * joins it to mod_approved / mod_rejected; modId + slug join it to the install copy events.
 */
export function modSubmittedEvent(input: ModSubmittedEventInput): ServerEvent {
  const { userId, ...properties } = input
  return { distinctId: userId, event: 'mod_submitted', properties }
}
