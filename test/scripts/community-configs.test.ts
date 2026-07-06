import { describe, expect, it } from 'vitest'
import { validateSubmitInput } from '@/submit/submit'
import { COMMUNITY_CONFIGS } from '../../scripts/seed-data/community-configs'

describe('community seed data', () => {
  it('has 15 entries, each passing submit validation', () => {
    expect(COMMUNITY_CONFIGS.length).toBe(15)
    for (const e of COMMUNITY_CONFIGS) {
      expect(() =>
        validateSubmitInput({
          title: e.title,
          description: e.description,
          interpreter: e.interpreter,
          source: e.source,
          // exactOptionalPropertyTypes forbids passing an explicit `undefined` into an optional
          // prop; `?? []` matches the conditional-spread pattern in scripts/seed-community.ts.
          networkHosts: e.networkHosts ?? [],
        }),
      ).not.toThrow()
    }
  })
  it('every entry carries MIT license + a pinned source url + numeric github id', () => {
    for (const e of COMMUNITY_CONFIGS) {
      expect(e.license).toBe('MIT')
      expect(e.sourceUrl).toMatch(
        /^https:\/\/(github\.com\/.+\/blob\/[0-9a-f]{40}\/|gist\.github\.com\/)/,
      )
      expect(e.githubId).toMatch(/^\d+$/)
    }
  })
  it('descriptions keep the two-word convention and stay concise', () => {
    for (const e of COMMUNITY_CONFIGS) {
      expect(e.description.toLowerCase()).not.toMatch(/(?<![a-z/.-])statusline(?![a-z.-])/)
      expect(e.description.length).toBeLessThan(400)
    }
  })
})
