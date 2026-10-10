import type { DrawLocation } from '@/mods/footprint'
import type { RegionGrey } from './imagemagick'
import {
  type BORDER_PROBES,
  CONTENT,
  CROP_MARGIN,
  PANE,
  PANE_BORDER_GREY,
  PANE_CHAT_LEFT,
  PANE_MARGIN,
  PROMPT_BORDER_GREY,
  PROMPT_BOX,
  type Rect,
} from './screen'

/** Two grey levels of a flat border apart, and well under a text column's spread. */
const BORDER_TOLERANCE = 0.01

const isBorder = ({ mean, deviation }: RegionGrey, grey: number) =>
  Math.abs(mean - grey) < BORDER_TOLERANCE && deviation < BORDER_TOLERANCE

/**
 * Which layout the final shot shows, read from the borders that place it. A shot that matches
 * neither means Desktop no longer looks the way the fixed positions assume.
 */
export function readLayout(greys: Record<keyof typeof BORDER_PROBES, RegionGrey>): 'chat' | 'pane' {
  if (
    isBorder(greys.pane, PANE_BORDER_GREY) &&
    isBorder(greys.promptBesidePane, PROMPT_BORDER_GREY)
  ) {
    return 'pane'
  }
  if (isBorder(greys.prompt, PROMPT_BORDER_GREY)) return 'chat'
  throw new Error(
    'the final shot matches neither layout in src/render/mods/desktop/screen.ts; re-measure it for this Desktop',
  )
}

export interface ShotFacts {
  /** The bounding box, in CSS pixels, of what differs from the no-mod baseline; null if nothing. */
  changed: Rect | null
  paneOpen: boolean
  draws: readonly DrawLocation[]
}

export type Frame = { kind: 'nothing' } | { kind: 'crop'; rect: Rect; cardAnchor: 'top' | 'bottom' }

const clamp = (left: number, top: number, right: number, bottom: number): Rect => {
  const x = Math.max(CONTENT.left, left)
  const y = Math.max(CONTENT.top, top)
  return {
    x,
    y,
    width: Math.min(CONTENT.right, right) - x,
    height: Math.min(CONTENT.bottom, bottom) - y,
  }
}

const PANE_ONLY = clamp(
  PANE.x - PANE_MARGIN,
  PANE.y - PANE_MARGIN,
  PANE.x + PANE.width + PANE_MARGIN,
  PANE.y + PANE.height + PANE_MARGIN,
)

const CHAT_AND_PANE = clamp(
  PANE_CHAT_LEFT - CROP_MARGIN,
  PANE.y - PANE_MARGIN,
  PANE.x + PANE.width + PANE_MARGIN,
  CONTENT.bottom,
)

/** The chat column from the topmost change, or the prompt box if lower, down through the toolbar. */
function chatColumn(changed: Rect): Rect {
  const left = Math.min(PROMPT_BOX.x, changed.x) - CROP_MARGIN
  const right = Math.max(PROMPT_BOX.x + PROMPT_BOX.width, changed.x + changed.width) + CROP_MARGIN
  const top = Math.min(PROMPT_BOX.y, changed.y) - CROP_MARGIN
  return clamp(left, top, right, CONTENT.bottom)
}

/**
 * Where to crop the final shot. With a pane open the chat column narrows, so a comparison with the
 * baseline says nothing and the crop is fixed: the pane alone when the mod draws only there.
 */
export function frameShot({ changed, paneOpen, draws }: ShotFacts): Frame {
  if (paneOpen) {
    const paneOnly = draws.length > 0 && draws.every((d) => d === 'pane')
    return { kind: 'crop', rect: paneOnly ? PANE_ONLY : CHAT_AND_PANE, cardAnchor: 'top' }
  }
  if (!changed) return { kind: 'nothing' }
  return { kind: 'crop', rect: chatColumn(changed), cardAnchor: 'bottom' }
}
