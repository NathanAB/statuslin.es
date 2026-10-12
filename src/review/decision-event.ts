import type { SubmissionKind } from '@/db/schema'
import type { ServerEvent } from '@/lib/posthog-server'

export type ReviewDecision = 'approved' | 'rejected'

/** Events are named `<kind>_<decision>`: statusline_approved, mod_rejected, … */
const EVENT_PREFIX = (kind: SubmissionKind) => (kind === 'mod' ? 'mod' : 'statusline')

/** The config or mod a reviewed version belongs to. */
export type ReviewedItem =
  | { kind: 'status_line'; configId: string; slug: string }
  | { kind: 'mod'; modId: string; slug: string }

interface DecisionEventInput {
  /** The reviewing admin's id — PostHog identifies signed-in users on user.id (see __root.tsx). */
  adminId: string
  decision: ReviewDecision
  versionId: string
  /** Undefined only if the version's config or mod couldn't be found; the event still fires. */
  reviewed: ReviewedItem | undefined
}

/**
 * Build the PostHog event for an admin's approve/reject decision. versionId joins it to the
 * submission event; configId (or modId) + slug join it to the copy events and the item's page.
 */
export function decisionEvent(input: DecisionEventInput): ServerEvent {
  const { kind = 'status_line', ...item } = input.reviewed ?? {}
  return {
    distinctId: input.adminId,
    event: `${EVENT_PREFIX(kind)}_${input.decision}`,
    properties: { versionId: input.versionId, ...item },
  }
}
