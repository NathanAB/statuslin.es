import type { RegionGrey } from './imagemagick'
import {
  bandAbovePrompt,
  cardBottom,
  drawnRows,
  promptTop,
  type RowProfile,
  uncutTop,
} from './rows'
import {
  type BORDER_PROBES,
  CARD_MAX_HEIGHT,
  CONTENT,
  CROP_MARGIN,
  PANE,
  PANE_BODY,
  PANE_BORDER_GREY,
  PANE_CARD_MAX_HEIGHT,
  PANE_MARGIN,
  PROMPT_BORDER_GREY,
  PROMPT_BOX,
  type Rect,
  SCROLL_GUTTER,
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
  /**
   * The bounding box, in CSS pixels, of what differs from the no-mod baseline (outside the prompt
   * text and the scrollbar gutter); null if nothing.
   */
  changed: Rect | null
  paneOpen: boolean
  /** The final shot, row by row, across its layout's chat column. */
  rows: RowProfile
  /** The final shot, row by row, across the plate strips at its chat column's two edges. */
  plate: RowProfile
  /** The final shot, row by row, across the pane's body: read only when a pane is open. */
  pane?: RowProfile
}

/** Where to crop the shot for the mod page, and for its card. */
export type Frame = { kind: 'nothing' } | { kind: 'crop'; rect: Rect; card: Rect }

/** Above a band's plate, the blank rows a card keeps so the plate's rounded top shows. */
const CARD_PAD = 6

const clamp = (
  left: number,
  top: number,
  right: number,
  bottom: number,
  rightLimit: number = CONTENT.right,
): Rect => {
  const x = Math.max(CONTENT.left, left)
  const y = Math.max(CONTENT.top, top)
  return {
    x,
    y,
    width: Math.min(rightLimit, right) - x,
    height: Math.min(CONTENT.bottom, bottom) - y,
  }
}

const PANE_ONLY = clamp(
  PANE.x - PANE_MARGIN,
  PANE.y - PANE_MARGIN,
  PANE.x + PANE.width + PANE_MARGIN,
  PANE.y + PANE.height + PANE_MARGIN,
)

const PROMPT_RIGHT = PROMPT_BOX.x + PROMPT_BOX.width

/**
 * The card when the mod draws by the prompt box: its band, from the plate down to the prompt box,
 * and the prompt box and toolbar too when it writes in the toolbar. Null when it does neither.
 */
function promptCard(plate: RowProfile, left: number, right: number, toolbar: boolean): Rect | null {
  const boxTop = promptTop(plate)
  const band = bandAbovePrompt(plate, boxTop)
  if (!band && !toolbar) return null
  const top = band ? band.top - CARD_PAD : boxTop - CROP_MARGIN
  return clamp(left, top, right, toolbar ? CONTENT.bottom : boxTop)
}

/**
 * The card when a pane is open: the pane's body inside its border, from the first row the mod
 * draws to the last, down to PANE_CARD_MAX_HEIGHT. Null when nothing shows in the body.
 */
function paneCard(pane: RowProfile): Rect | null {
  const bodyBottom = PANE_BODY.y + PANE_BODY.height
  const drawn = drawnRows(pane, PANE_BODY.y, bodyBottom)
  if (!drawn) return null
  const top = Math.max(PANE_BODY.y, drawn.top - CROP_MARGIN)
  const end = Math.min(bodyBottom, drawn.bottom + 1 + CROP_MARGIN)
  const bottom = cardBottom(pane, top, end, PANE_CARD_MAX_HEIGHT)
  return { x: PANE_BODY.x, y: top, width: PANE_BODY.width, height: bottom - top }
}

/** The top of the crop, down to about CARD_MAX_HEIGHT. */
const topCard = (rect: Rect, bottom: number): Rect => ({ ...rect, height: bottom - rect.y })

/**
 * The chat column from the topmost change, or the prompt box if lower, down through the toolbar,
 * widened to a change outside it (a toast) but never into the scrollbar gutter, and never starting
 * halfway through an element.
 */
function chatFrame(changed: Rect, rows: RowProfile, plate: RowProfile): Frame {
  // A change inside the margin, such as an antialiased edge, is already in the crop.
  const left = Math.min(PROMPT_BOX.x, changed.x + CROP_MARGIN) - CROP_MARGIN
  const right = Math.max(PROMPT_RIGHT, changed.x + changed.width - CROP_MARGIN) + CROP_MARGIN
  const top = uncutTop(rows, Math.max(CONTENT.top, Math.min(PROMPT_BOX.y, changed.y) - CROP_MARGIN))
  const rect = clamp(left, top, right, CONTENT.bottom, SCROLL_GUTTER.x)
  const toolbar = changed.y + changed.height > PROMPT_BOX.y + PROMPT_BOX.height
  const card =
    promptCard(plate, PROMPT_BOX.x - CROP_MARGIN, PROMPT_RIGHT + CROP_MARGIN, toolbar) ??
    topCard(rect, cardBottom(rows, rect.y, rect.y + rect.height))
  return { kind: 'crop', rect, card }
}

/**
 * Where to crop the final shot. With a pane open the chat column narrows, so a comparison with the
 * baseline says nothing and the crop is fixed: the pane alone. Its card is what the mod draws in
 * the pane, never a band beside it that the crop leaves out.
 */
export function frameShot({ changed, paneOpen, rows, plate, pane }: ShotFacts): Frame {
  if (paneOpen) {
    const rect = PANE_ONLY
    const card =
      (pane && paneCard(pane)) ?? topCard(rect, rect.y + Math.min(CARD_MAX_HEIGHT, rect.height))
    return { kind: 'crop', rect, card }
  }
  if (!changed) return { kind: 'nothing' }
  return chatFrame(changed, rows, plate)
}
