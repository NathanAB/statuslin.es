import { describe, expect, it } from 'vitest'
import { submitNextSteps, submitPageCopy } from '@/submit/submit-copy'

describe('submitPageCopy', () => {
  it('names the page and button for each kind of submission', () => {
    expect(submitPageCopy(null)).toMatchObject({
      heading: 'Submit a status line or mod',
      button: 'Submit',
    })
    expect(submitPageCopy({ kind: 'resubmission' })).toMatchObject({
      heading: 'Fix and resubmit',
      button: 'Resubmit',
    })
    expect(submitPageCopy({ kind: 'update' })).toMatchObject({
      heading: 'Submit an update',
      button: 'Submit update',
    })
  })

  it('tells an updater the live version stays up until review', () => {
    expect(submitPageCopy({ kind: 'update' }).intro).toMatch(
      /live version stays up until .*review/i,
    )
  })
})

// What happens next, beside the form: true to the pipeline for both kinds, new or an update.
describe('submitNextSteps', () => {
  it('says a script that needs the network waits until its hosts are checked', () => {
    expect(submitNextSteps('status_line', false)[0]).toMatch(/waits until we've checked the hosts/)
  })

  it('says an approved update replaces the live version', () => {
    expect(submitNextSteps('status_line', true)[2]).toMatch(/replaces the live version/)
    expect(submitNextSteps('mod', true)[2]).toMatch(/replaces the live version/)
    expect(submitNextSteps('mod', false)[2]).toMatch(/goes up in the gallery/)
  })
})
