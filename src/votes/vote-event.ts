import type { ServerEvent } from '@/lib/posthog-server'

interface VoteEventInput {
  /** The voting user's id — PostHog identifies signed-in users on user.id (see __root.tsx). */
  userId: string
  configId: string
  /** The vote state after the toggle: true = vote cast, false = vote removed. */
  voted: boolean
  /** The config's upvote count after the toggle. */
  count: number
}

/**
 * Build the PostHog event for an upvote toggle. Fired SERVER-SIDE (in toggleVoteFn), not in the
 * browser, so ad blockers can't strip it — the same reasoning the copy event already follows.
 * Voting is signed-in only, so the user id is always present and joins the person's funnel
 * directly. The post-toggle state picks the event name: cast → upvoted, removed → unvoted.
 * configId is the only config identifier carried — the durable key, like the copy event. A
 * slug isn't included because it would have to come from the client and could only mislabel
 * telemetry (configId already identifies the config).
 */
export function voteEvent(input: VoteEventInput): ServerEvent {
  return {
    distinctId: input.userId,
    event: input.voted ? 'statusline_upvoted' : 'statusline_unvoted',
    properties: { configId: input.configId, newCount: input.count },
  }
}
