import { describe, expect, it } from 'vitest'
import { coerceSort } from '@/gallery/queries'

describe('coerceSort', () => {
  it('passes through "new"', () => {
    expect(coerceSort('new')).toBe('new')
  })

  it('passes through "top"', () => {
    expect(coerceSort('top')).toBe('top')
  })

  it('passes through "trending"', () => {
    expect(coerceSort('trending')).toBe('trending')
  })

  it('returns the default "trending" for an unknown string', () => {
    expect(coerceSort('hot')).toBe('trending')
    expect(coerceSort('latest')).toBe('trending')
  })

  it('returns the default "trending" for undefined', () => {
    expect(coerceSort(undefined)).toBe('trending')
  })
})
