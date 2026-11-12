import { describe, expect, it } from 'vitest'
import { CURATION_FILE } from '@/mods/curation'
import { UNREVIEWED_FILE } from '@/mods/unreviewed'
import { assertReviewedOnMain } from '../../scripts/reviewed-on-main'

// updates:mods moves pins in the working copy; only the reviewed, merged file may go live.
describe('assertReviewedOnMain', () => {
  it('passes when the file is the one on main', () => {
    expect(() => assertReviewedOnMain(CURATION_FILE, '[1]\n', '[1]\n')).not.toThrow()
  })

  it.each([
    ['differs from main', '[2]\n'],
    ['is not on main', null],
  ])('refuses a file that %s, naming it', (_case, onMain) => {
    expect(() => assertReviewedOnMain(CURATION_FILE, '[1]\n', onMain)).toThrow(
      /src\/mods\/curation\.json is not the reviewed one on origin\/main/,
    )
    expect(() => assertReviewedOnMain(UNREVIEWED_FILE, '[1]\n', onMain)).toThrow(
      /src\/mods\/unreviewed\.json is not the reviewed one on origin\/main/,
    )
  })
})
