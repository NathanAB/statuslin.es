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

  it('returns "new" for an unknown string', () => {
    expect(coerceSort('hot')).toBe('new')
    expect(coerceSort('latest')).toBe('new')
  })

  it('returns "new" for undefined', () => {
    expect(coerceSort(undefined)).toBe('new')
  })

  it('returns "new" for null', () => {
    expect(coerceSort(null)).toBe('new')
  })

  it('returns "new" for a number', () => {
    expect(coerceSort(42)).toBe('new')
  })

  it('returns "new" for an object', () => {
    expect(coerceSort({ sort: 'top' })).toBe('new')
  })

  it('returns "new" for an empty string', () => {
    expect(coerceSort('')).toBe('new')
  })
})
