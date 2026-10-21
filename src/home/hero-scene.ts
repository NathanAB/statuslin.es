import type { HeroSession } from '@/home/hero-sessions'
import type { HeroItem } from '@/home/showcase'
import { terminalPlacement, writesInToolbar } from '@/mods/draw-placement'
import type { StageView } from '@/ui/session-stage'

/** Where the hero shows its pick: Claude Code in a terminal, or Claude Desktop's Code tab. */
export type HeroApp = 'cli' | 'desktop'

export interface HeroScene {
  view: StageView
  /** The screen's name for a screen reader. */
  label: string
  /** The line under the toolbar's choices: the session's data, or why the session is fixed. */
  caption: string
  /** Whether `caption` explains why the session is fixed, rather than giving its data. */
  sessionFixed: boolean
  /** What the live region says once the visitor has changed something. */
  shown: string
}

/**
 * What the hero's stage shows for a pick in an app and session. A status line runs under the
 * prompt in the session's terminal; a mod draws where its footprint says; in Desktop each shows
 * its recorded shot, a status line's through statusline-anywhere.
 */
export function heroScene(item: HeroItem, app: HeroApp, session: HeroSession): HeroScene {
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
        item.kind === 'mod'
          ? 'Desktop previews are recorded in the Everyday session only.'
          : 'Desktop previews are recorded in the Everyday session only, through statusline-anywhere.',
      sessionFixed: true,
      shown: `Showing ${title} in Claude Desktop.`,
    }
  if (item.kind === 'mod') {
    const at = terminalPlacement(item.mod.footprint)
    const where = at === 'above-prompt' ? 'above the prompt' : 'under the prompt'
    return {
      view: {
        kind: 'cli',
        at,
        segments: item.mod.render,
        missing: 'Draws nothing in the terminal.',
      },
      label: `Claude Code with ${title} ${where}, in the ${session.label} session`,
      caption: 'Mods are recorded in the Everyday session only.',
      sessionFixed: true,
      shown: `Showing ${title} ${where}, in the ${session.label} session.`,
    }
  }
  return {
    view: {
      kind: 'cli',
      at: 'under-prompt',
      segments: item.line.renders[session.key] ?? null,
      missing: 'No render for this session yet.',
    },
    label: `Claude Code with ${title} under the prompt, in the ${session.label} session`,
    caption: session.caption,
    sessionFixed: false,
    shown: `Showing ${title} in the ${session.label} session.`,
  }
}
