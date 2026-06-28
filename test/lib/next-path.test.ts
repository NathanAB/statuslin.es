import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/lib/next-path'

describe('safeNextPath', () => {
  it('returns a normal absolute path unchanged', () => {
    expect(safeNextPath('/c/some-slug')).toBe('/c/some-slug')
  })

  it('preserves the search string on an absolute path', () => {
    expect(safeNextPath('/c/x?tab=1')).toBe('/c/x?tab=1')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeNextPath('//evil.com')).toBe('/')
  })

  it('rejects absolute URLs with a scheme', () => {
    expect(safeNextPath('https://evil.com')).toBe('/')
  })

  it('rejects the empty string', () => {
    expect(safeNextPath('')).toBe('/')
  })

  it('rejects a path not starting with a slash', () => {
    expect(safeNextPath('c/some-slug')).toBe('/')
  })

  it('rejects backslash escapes', () => {
    expect(safeNextPath('/\\evil')).toBe('/')
  })

  it('rejects whitespace / control characters', () => {
    expect(safeNextPath('/foo bar')).toBe('/')
    expect(safeNextPath('/foo\nbar')).toBe('/')
  })

  it('rejects non-string values', () => {
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath(42)).toBe('/')
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath({})).toBe('/')
  })
})
