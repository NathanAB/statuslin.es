import { describe, expect, it } from 'vitest'
import { kindCount } from '@/gallery/kind-count'

describe('kindCount', () => {
  it('names both kinds when both are present', () => {
    expect(kindCount(4, 1)).toBe('4 status lines and 1 mod')
    expect(kindCount(1, 9)).toBe('1 status line and 9 mods')
  })

  it('names only the kind that is present', () => {
    expect(kindCount(32, 0)).toBe('32 status lines')
    expect(kindCount(0, 2)).toBe('2 mods')
  })
})
