import { describe, expect, it } from 'vitest'
import { submittedEvent } from '@/submit/submitted-event'

describe('submittedEvent', () => {
  it('builds the statusline_submitted event', () => {
    const evt = submittedEvent({ userId: 'u1', interpreter: 'bash', slug: 'my-slug' })
    expect(evt.event).toBe('statusline_submitted')
  })

  it('attributes the event to the submitting user', () => {
    const evt = submittedEvent({ userId: 'u9', interpreter: 'bash', slug: 's' })
    expect(evt.distinctId).toBe('u9')
  })

  it('carries interpreter and slug as properties', () => {
    const evt = submittedEvent({ userId: 'u1', interpreter: 'python', slug: 'cool-line' })
    expect(evt.properties).toEqual({ interpreter: 'python', slug: 'cool-line' })
  })
})
