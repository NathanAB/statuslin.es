import { describe, expect, it } from 'vitest'
import { browserFunnelIds } from '@/lib/posthog-funnel-ids'

describe('browserFunnelIds', () => {
  it("returns the browser's distinct and session ids", () => {
    const posthog = { get_distinct_id: () => 'did-1', get_session_id: () => 'sid-1' }
    expect(browserFunnelIds(posthog)).toEqual({ distinctId: 'did-1', sessionId: 'sid-1' })
  })

  it('returns no ids when PostHog is uninitialized and its getters throw', () => {
    const posthog = {
      get_distinct_id: () => {
        throw new Error('not initialized')
      },
      get_session_id: () => 'sid-1',
    }
    expect(browserFunnelIds(posthog)).toEqual({})
  })
})
