import { describe, expect, it } from 'vitest'
import { FOOTPRINT_MEANINGS } from '@/mods/footprint-meanings'

// The home hero names a mod's risks as "Can …" and a short name or two on one line.
describe('FOOTPRINT_MEANINGS', () => {
  const risky = [...FOOTPRINT_MEANINGS].filter(([, meaning]) => meaning.risk)

  it('gives every risk a short name of at most four words', () => {
    expect(risky.length).toBeGreaterThan(0)
    for (const [key, meaning] of risky) {
      const short = meaning.risk ? meaning.short : ''
      expect(short, key).toMatch(/^\S/)
      expect(short.split(/\s+/).length, `${key}: ${short}`).toBeLessThanOrEqual(4)
    }
  })
})
