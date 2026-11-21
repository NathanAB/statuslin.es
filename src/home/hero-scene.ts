import type { HeroItem } from '@/home/showcase'
import { type TerminalPlacement, terminalPlacement, writesInToolbar } from '@/mods/draw-placement'
import type { StageView } from '@/ui/session-stage'

/** Where the hero shows its pick: Claude Code in a terminal, or Claude Desktop's Code tab. */
export type HeroApp = 'cli' | 'desktop'

export interface HeroScene {
  view: StageView
  /** The screen's name for a screen reader. */
  label: string
  /** A note beside the app choice, or null: a status line shows in Desktop only through a mod. */
  caption: string | null
  /** What the live region says once the visitor has changed something. */
  shown: string
}

const WHERE: Record<TerminalPlacement, string> = {
  'above-prompt': 'above the prompt',
  'under-prompt': 'under the prompt',
  'side-pane': 'in a pane beside the conversation',
}

/**
 * What the hero's stage shows for a pick in an app, in the Everyday session. A status line runs
 * under the prompt; a mod draws where its footprint says, a pane beside the conversation; in Desktop each shows its recorded shot,
 * a status line's through statusline-anywhere.
 */
export function heroScene(item: HeroItem, app: HeroApp): HeroScene {
  const title = item.kind === 'mod' ? item.mod.title : item.line.title
  if (app === 'desktop')
    return {
      view: {
        kind: 'desktop',
        shot: item.kind === 'mod' ? item.mod.desktop : item.line.desktop,
        // A card ends at the band, so the prompt box is drawn under it, unless the mod writes in
        // the toolbar: its card then already shows the prompt box and toolbar.
        promptBox: item.kind === 'status-line' || !writesInToolbar(item.mod.footprint),
        missing: 'No Claude Desktop preview yet.',
      },
      label: `${title} in Claude Desktop`,
      caption:
        item.kind === 'status-line' ? 'Status lines show here through statusline-anywhere.' : null,
      shown: `Showing ${title} in Claude Desktop.`,
    }
  const at =
    item.kind === 'mod' ? terminalPlacement(item.mod.footprint, item.mod.render) : 'under-prompt'
  const where = WHERE[at]
  return {
    view: {
      kind: 'cli',
      at,
      segments: item.kind === 'mod' ? item.mod.render : item.line.render,
      missing: item.kind === 'mod' ? 'Draws nothing in the terminal.' : 'No render yet.',
    },
    label: `Claude Code with ${title} ${where}`,
    caption: null,
    shown: `Showing ${title} ${where}.`,
  }
}
