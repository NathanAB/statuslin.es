import { describe, expect, it } from 'vitest'
import { slugify } from '@/submit/slug'

describe('slugify', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('My Cool Statusline!')).toBe('my-cool-statusline')
  })
  it('collapses repeats and trims edge dashes', () => {
    expect(slugify('  a -- b  ')).toBe('a-b')
  })
  it('falls back to "config" for empty input', () => {
    expect(slugify('!!!')).toBe('config')
  })
})
