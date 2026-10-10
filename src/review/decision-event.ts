import type { ServerEvent } from '@/lib/posthog-server'

export type ReviewDecision = 'approved' | 'rejected'

const EVENT_BY_DECISION: Record<ReviewDecision, string> = {
  approved: 'statusline_approved',
  rejected: 'statusline_rejected',
}

/** The config a reviewed version belongs to. */
export interface VersionConfig {
  configId: string
  slug: string
}

interface DecisionEventInput {
  /** The reviewing admin's id — PostHog identifies signed-in users on user.id (see __root.tsx). */
  adminId: string
  decision: ReviewDecision
  versionId: string
  /** Undefined only if the version's config couldn't be found; the event still fires without it. */
  config: VersionConfig | undefined
}

/**
 * Build the PostHog event for an admin's approve/reject decision. versionId joins it to the
 * submission event; configId + slug join it to the copy events and the config's page.
 */
export function decisionEvent(input: DecisionEventInput): ServerEvent {
  return {
    distinctId: input.adminId,
    event: EVENT_BY_DECISION[input.decision],
    properties: { versionId: input.versionId, ...input.config },
  }
}
