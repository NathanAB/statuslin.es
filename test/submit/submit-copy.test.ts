import { describe, expect, it } from 'vitest'
import { submitPageCopy } from '@/submit/submit-copy'

describe('submitPageCopy', () => {
  it('names the page and button for each kind of submission', () => {
    expect(submitPageCopy(null)).toMatchObject({
      heading: 'Submit a status line',
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
      /live version stays in the gallery until .*review/i,
    )
  })
})
