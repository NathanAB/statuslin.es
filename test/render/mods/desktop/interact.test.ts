import { describe, expect, it } from 'vitest'
import { buttonShown } from '@/render/mods/desktop/interact'

describe('buttonShown', () => {
  it.each([
    { window: 'dark' as const, mean: 0.82, shown: true },
    { window: 'dark' as const, mean: 0.15, shown: false },
    { window: 'light' as const, mean: 0.18, shown: true },
    { window: 'light' as const, mean: 0.97, shown: false },
  ])(
    'reads a probe of grey $mean in a $window window as shown: $shown',
    ({ window, mean, shown }) => {
      expect(buttonShown(window, mean)).toBe(shown)
    },
  )
})
