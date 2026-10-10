/**
 * Every fixed screen position the Desktop recorder clicks, probes or crops, in CSS pixels of
 * Claude Desktop 2.31226.1 in dark theme with its sidebar collapsed. Measured on recorded
 * screenshots; a Desktop upgrade means re-measuring here and running `bun run smoke:desktop`.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Desktop's window, which fills the virtual display. */
export const WINDOW = { width: 1100, height: 640 }
/** Device pixels per CSS pixel: screenshots are sharp on Retina screens. */
export const SCALE = 2

const CENTER: Point = { x: WINDOW.width / 2, y: WINDOW.height / 2 }
const fromCenter = (dx: number, dy: number): Point => ({ x: CENTER.x + dx, y: CENTER.y + dy })
const rectFromCenter = (dx: number, dy: number, width: number, height: number): Rect => ({
  ...fromCenter(dx, dy),
  width,
  height,
})

/**
 * A dialog's primary button: where to click, and a region inside it that is bright (white in dark
 * theme) only while the button is on screen. The dialogs are centred in the window.
 */
export interface DialogButton {
  click: Point
  probe: Rect
}

/** The gateway welcome screen's "Continue". */
export const WELCOME_CONTINUE: DialogButton = {
  click: fromCenter(0, 88),
  probe: rectFromCenter(-60, 82, 120, 12),
}

/** "Trust this workspace?" → "Trust workspace". */
export const TRUST_WORKSPACE: DialogButton = {
  click: fromCenter(121, 61),
  probe: rectFromCenter(66, 52, 110, 18),
}

/** "Auto mode is now Claude Code's default permission mode" → "Got it". */
export const AUTO_MODE_GOT_IT: DialogButton = {
  click: fromCenter(178, 66),
  probe: rectFromCenter(181, 58, 20, 17),
}

/** Inside the prompt box whether or not a pane is open, so a click focuses it. */
export const PROMPT_FOCUS: Point = { x: 300, y: WINDOW.height - 60 }
/** The left margin of the main area: clicking it takes focus off the prompt, so no caret blinks. */
export const BLUR: Point = { x: 20, y: WINDOW.height - 170 }
/** Where the mouse rests for screenshots: on the window's right edge, over nothing that hovers. */
export const MOUSE_REST: Point = { x: WINDOW.width - 1, y: CENTER.y }

/** The window's content, inside the light frame Desktop draws on Linux. */
export const CONTENT = { left: 4, top: 0, right: WINDOW.width - 4, bottom: WINDOW.height - 4 }

/** The prompt box with no pane open; the chat column is its width. */
export const PROMPT_BOX: Rect = { x: 166, y: 561, width: 768, height: 40 }
/** What the input steps type into: left out of the comparison with the baseline. */
export const PROMPT_TEXT: Rect = {
  x: PROMPT_BOX.x + 2,
  y: PROMPT_BOX.y + 2,
  width: PROMPT_BOX.width - 4,
  height: PROMPT_BOX.height - 4,
}
/** A docked pane, from its border; the chat column narrows to its left. */
export const PANE: Rect = { x: 732, y: 44, width: 356, height: 584 }
/** The chat column's left edge (its prompt box's left border) while a pane is open. */
export const PANE_CHAT_LEFT = 45

/** Space kept around a crop's content so a border is not flush with the edge. */
export const CROP_MARGIN = 8
export const PANE_MARGIN = 4

/**
 * One-pixel columns that are a border's flat grey only in one layout: the prompt box's left border
 * with no pane, the prompt box's left border beside a pane, and the pane's left border.
 */
export const BORDER_PROBES = {
  prompt: { x: PROMPT_BOX.x, y: PROMPT_BOX.y + 10, width: 1, height: 20 },
  promptBesidePane: { x: PANE_CHAT_LEFT, y: PROMPT_BOX.y + 10, width: 1, height: 20 },
  pane: { x: PANE.x, y: 200, width: 1, height: 400 },
} satisfies Record<string, Rect>

/** Grey levels (0..1) of the borders above, measured: the prompt box's and the pane's. */
export const PROMPT_BORDER_GREY = 54 / 255
export const PANE_BORDER_GREY = 42 / 255
