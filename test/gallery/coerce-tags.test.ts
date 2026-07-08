import { describe, expect, it } from 'vitest'
import { coerceTags } from '@/gallery/queries'

describe('coerceTags', () => {
  it('parses a CSV of known slugs, dropping unknowns + dupes, in registry order', () => {
    // 'quota' precedes 'node' in ALL_TAG_SLUGS, so the result is registry-ordered, not input-ordered.
    expect(coerceTags('node,quota,bogus,node')).toEqual(['quota', 'node'])
  })
  it('returns [] for undefined/garbage', () => {
    expect(coerceTags(undefined)).toEqual([])
    expect(coerceTags(42)).toEqual([])
  })
})
