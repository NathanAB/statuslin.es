import { describe, expect, it } from 'vitest'
import { decisionEvent } from '@/review/decision-event'

const decided = {
  adminId: 'admin-1',
  versionId: 'ver-1',
  reviewed: { kind: 'status_line' as const, configId: 'cfg-1', slug: 'cool-line' },
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
    const evt = decisionEvent({ ...decided, decision: 'approved', reviewed: undefined })
    expect(evt.properties).toEqual({ versionId: 'ver-1' })
  })
  it.each([
    ['approved', 'mod_approved'],
    ['rejected', 'mod_rejected'],
  ] as const)('names a mod decision (%s) as %s, carrying the mod', (decision, event) => {
    const evt = decisionEvent({
      adminId: 'admin-1',
      versionId: 'ver-2',
      decision,
      reviewed: { kind: 'mod', modId: 'mod-1', slug: 'pixel-cat' },
    })

    expect(evt).toEqual({
      distinctId: 'admin-1',
      event,
      properties: { versionId: 'ver-2', modId: 'mod-1', slug: 'pixel-cat' },
    })
  })
})
