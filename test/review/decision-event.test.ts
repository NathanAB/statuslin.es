import { describe, expect, it } from 'vitest'
import { decisionEvent } from '@/review/decision-event'

const decided = {
  adminId: 'admin-1',
  versionId: 'ver-1',
  config: { configId: 'cfg-1', slug: 'cool-line' },
}

describe('decisionEvent', () => {
  it('maps an approval to the statusline_approved event', () => {
    expect(decisionEvent({ ...decided, decision: 'approved' }).event).toBe('statusline_approved')
  })

  it('maps a rejection to the statusline_rejected event', () => {
    expect(decisionEvent({ ...decided, decision: 'rejected' }).event).toBe('statusline_rejected')
  })

  it('attributes the event to the reviewing admin', () => {
    expect(decisionEvent({ ...decided, decision: 'approved' }).distinctId).toBe('admin-1')
  })

  it('carries the version, config and slug so it joins the submit and copy events', () => {
    expect(decisionEvent({ ...decided, decision: 'rejected' }).properties).toEqual({
      versionId: 'ver-1',
      configId: 'cfg-1',
      slug: 'cool-line',
    })
  })

  it('still carries the version id when its config could not be found', () => {
    const evt = decisionEvent({ ...decided, decision: 'approved', config: undefined })
    expect(evt.properties).toEqual({ versionId: 'ver-1' })
  })
})
