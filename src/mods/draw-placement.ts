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

// The footprint entries that write in the toolbar under Desktop's prompt box: the session-mode
// label ("Deck 1") and a status entry.
const TOOLBAR_WRITES = new Set(['ui.render{component=SessionMode}', '$.ui.status'])

/**
 * Whether a mod writes in Claude Desktop's toolbar. Its Desktop card then shows the prompt box and
 * toolbar under its band (the recorder crops by what changed on screen), so the hero draws no
 * second prompt box.
 */
export function writesInToolbar(footprint: ModFootprint): boolean {
  return [...footprint.events, ...footprint.calls].some((entry) => TOOLBAR_WRITES.has(entry))
}
