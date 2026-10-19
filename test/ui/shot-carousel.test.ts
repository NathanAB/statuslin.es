import { describe, expect, it } from 'vitest'
import { nearestToCentre } from '@/ui/shot-carousel'

// Shots of different widths: 784px and 354px, as real Desktop card shots are.
const panels = [
  { left: 0, width: 784 },
  { left: 864, width: 354 },
  { left: 1298, width: 784 },
  { left: 2162, width: 354 },
]

describe('nearestToCentre', () => {
  it("lights the shot whose middle is closest to the row's centre", () => {
    expect(nearestToCentre(panels, 392)).toBe(0)
    expect(nearestToCentre(panels, 1041)).toBe(1)
    expect(nearestToCentre(panels, 1700)).toBe(2)
  })

  // A narrow last shot never crosses a thin centre strip, but it is still the nearest one.
  it('lights a narrow shot at the end of the row', () => {
    expect(nearestToCentre(panels, 2339)).toBe(3)
    expect(nearestToCentre(panels, 2600)).toBe(3)
  })

  it('lights nothing in an empty row', () => {
    expect(nearestToCentre([], 500)).toBe(-1)
  })
})
