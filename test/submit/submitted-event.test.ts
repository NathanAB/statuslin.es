import { describe, expect, it } from 'vitest'
import { submittedEvent } from '@/submit/submitted-event'

const submission = {
  userId: 'u1',
  interpreter: 'bash',
  slug: 'my-slug',
  configId: 'cfg-1',
  versionId: 'ver-1',
  isUpdate: false,
}

describe('submittedEvent', () => {
  it('builds the statusline_submitted event', () => {
    expect(submittedEvent(submission).event).toBe('statusline_submitted')
  })

  it('attributes the event to the submitting user', () => {
    expect(submittedEvent({ ...submission, userId: 'u9' }).distinctId).toBe('u9')
  })

  it('carries the interpreter and the config, version and slug it created', () => {
    const evt = submittedEvent({ ...submission, interpreter: 'python', slug: 'cool-line' })
    expect(evt.properties).toEqual({
      interpreter: 'python',
      slug: 'cool-line',
      configId: 'cfg-1',
      versionId: 'ver-1',
      isUpdate: false,
    })
  })

  it('flags a submission that updates an existing config', () => {
    expect(submittedEvent({ ...submission, isUpdate: true }).properties.isUpdate).toBe(true)
  })
})
