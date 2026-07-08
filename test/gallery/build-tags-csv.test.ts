import { describe, expect, it } from 'vitest'
import { buildTagsCsv } from '@/gallery/gallery-controls'

describe('buildTagsCsv', () => {
  it('joins selected slugs in registry order, not selection order', () => {
    // 'quota' precedes 'node' in ALL_TAG_SLUGS, so the CSV is registry-ordered.
    expect(buildTagsCsv(new Set(['node', 'quota']))).toBe('quota,node')
  })
  it('returns undefined for an empty selection', () => {
    expect(buildTagsCsv(new Set())).toBeUndefined()
  })
})
