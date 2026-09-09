import { describe, expect, it } from 'vitest'
import { FACET_INTRO } from '@/gallery/facet-copy'

describe('FACET_INTRO pick-guidance', () => {
  it('tells git, quota, and token-usage visitors which kind of config to pick', () => {
    expect(FACET_INTRO.git.join(' ')).toMatch(/pick/i)
    expect(FACET_INTRO.quota.join(' ')).toMatch(/pick/i)
    expect(FACET_INTRO['token-usage'].join(' ')).toMatch(/pick/i)
  })

  it('does not hardcode a live inventory count', () => {
    for (const paragraphs of Object.values(FACET_INTRO)) {
      expect(paragraphs.join(' ')).not.toMatch(/\b\d+ published\b/)
    }
  })
})
