import { describe, expect, it } from 'vitest'
import { activeSectionId } from '@/ui/use-active-section'

// Each section's top, in px from the top of the window, in page order.
const at = (...tops: number[]) => tops.map((top, i) => ({ id: `s${i}`, top }))

describe('activeSectionId', () => {
  it('is none while the reader is still above the first section', () => {
    expect(activeSectionId(at(400, 900, 1600), { line: 240, atBottom: false })).toBeNull()
  })

  it('is the last section whose top has passed the reading line', () => {
    expect(activeSectionId(at(-800, 120, 700), { line: 240, atBottom: false })).toBe('s1')
    expect(activeSectionId(at(-800, -300, 239), { line: 240, atBottom: false })).toBe('s2')
  })

  // The last sections can be too short to ever reach the line; at the bottom the last one is read.
  it('is the last section once the page is scrolled to the bottom', () => {
    expect(activeSectionId(at(-800, 120, 500), { line: 240, atBottom: true })).toBe('s2')
  })

  it('is none for a page with no sections', () => {
    expect(activeSectionId([], { line: 240, atBottom: true })).toBeNull()
  })
})
