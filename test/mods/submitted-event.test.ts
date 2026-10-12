import { describe, expect, it } from 'vitest'
import { modSubmittedEvent } from '@/mods/submitted-event'

describe('modSubmittedEvent', () => {
  it('names the mod and version the submitter sent, joining the review and copy events', () => {
    expect(
      modSubmittedEvent({
        userId: 'u1',
        slug: 'meter',
        modId: 'mod-1',
        versionId: 'ver-1',
        isUpdate: true,
      }),
    ).toEqual({
      distinctId: 'u1',
      event: 'mod_submitted',
      properties: { slug: 'meter', modId: 'mod-1', versionId: 'ver-1', isUpdate: true },
    })
  })
})
