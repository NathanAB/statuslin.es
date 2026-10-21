import { describe, expect, it } from 'vitest'
import { HERO_TRANSCRIPT } from '@/home/hero-transcript'

describe('HERO_TRANSCRIPT', () => {
  it('is a conversation that opens with your prompt and ends on Claude', () => {
    expect(HERO_TRANSCRIPT[0]?.kind).toBe('prompt')
    expect(HERO_TRANSCRIPT.some((line) => line.kind === 'say')).toBe(true)
  })
})
