import type { HeroSession } from '@/home/hero-sessions'
import type { HeroItem } from '@/home/showcase'
import { terminalPlacement } from '@/mods/terminal-placement'
import type { StageView } from '@/ui/session-stage'

/** Where the hero shows its pick: Claude Code in a terminal, or Claude Desktop's Code tab. */
export type HeroApp = 'cli' | 'desktop'

export interface HeroScene {
  view: StageView
  /** The screen's name for a screen reader. */
  label: string
  /** The toolbar's caption: the session's data, or the app it shows. */
  caption: string
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
        // A mod's whole shot already runs down through the prompt box; a status line's is its strip.
        promptBox: item.kind === 'status-line',
        missing: 'No Claude Desktop preview yet.',
      },
      label: `${title} in Claude Desktop`,
      caption:
        item.kind === 'mod'
          ? "Claude Desktop's Code tab"
          : 'Claude Desktop, through statusline-anywhere',
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
      caption: session.caption,
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
    shown: `Showing ${title} in the ${session.label} session.`,
  }
}
