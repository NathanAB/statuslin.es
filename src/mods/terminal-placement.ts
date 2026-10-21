import type { ModFootprint } from '@/db/schema'
import { describeFootprint } from './footprint'

/**
 * Where the home hero's terminal draws a mod: under the prompt for one that draws only there (a
 * prompt hint), else above it, where bands, panes and the rest sit closest to how they look.
 */
export function terminalPlacement(footprint: ModFootprint): 'above-prompt' | 'under-prompt' {
  const { draws } = describeFootprint(footprint)
  return draws.includes('under-prompt') && !draws.includes('above-prompt')
    ? 'under-prompt'
    : 'above-prompt'
}
