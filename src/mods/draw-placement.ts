import type { ModFootprint } from '@/db/schema'
import { PANE_MIN_ROWS } from '@/render/mods/side-pane'
import type { AnsiSegment } from '@/render/types'
import { describeFootprint } from './footprint'

export type TerminalPlacement = 'above-prompt' | 'under-prompt' | 'side-pane'

const rowCount = (render: AnsiSegment[]) =>
  render
    .map((segment) => segment.text)
    .join('')
    .split('\n').length

/**
 * Where the home hero's terminal draws a mod's `render`: beside the conversation for a pane (the
 * mod opens one, and the render is as tall as the recorder's pane crop), under the prompt for a mod
 * that draws only there (a prompt hint), else above it, where bands and the rest sit closest to how
 * they look.
 */
export function terminalPlacement(
  footprint: ModFootprint,
  render: AnsiSegment[] | null,
): TerminalPlacement {
  const { draws } = describeFootprint(footprint)
  if (draws.includes('pane') && render && rowCount(render) >= PANE_MIN_ROWS) return 'side-pane'
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
