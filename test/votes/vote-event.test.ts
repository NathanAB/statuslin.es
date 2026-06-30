import { describe, expect, it } from 'vitest'
import { voteEvent } from '@/votes/vote-event'

describe('voteEvent', () => {
  it('maps a cast vote to the statusline_upvoted event', () => {
    const evt = voteEvent({ userId: 'u1', configId: 'c1', voted: true, count: 5 })
    expect(evt.event).toBe('statusline_upvoted')
  })

  it('maps a removed vote to the statusline_unvoted event', () => {
    const evt = voteEvent({ userId: 'u1', configId: 'c1', voted: false, count: 4 })
    expect(evt.event).toBe('statusline_unvoted')
  })

  it('attributes the event to the voting user', () => {
    const evt = voteEvent({ userId: 'u7', configId: 'c1', voted: true, count: 1 })
    expect(evt.distinctId).toBe('u7')
  })

  it('carries configId and newCount as properties (configId is the durable key, not slug)', () => {
    const evt = voteEvent({ userId: 'u1', configId: 'c9', voted: true, count: 3 })
    expect(evt.properties).toEqual({ configId: 'c9', newCount: 3 })
    // No client-supplied slug: configId is the durable key, and a client-trusted slug would only
    // mislabel telemetry (see the security review). Guard against the key creeping back.
    expect(evt.properties).not.toHaveProperty('slug')
  })
})
