/**
 * Every fixed screen position the Desktop recorder clicks, probes or crops, in CSS pixels of
 * Claude Desktop 6.28899.6 in dark theme with its sidebar and session details closed. Measured on
 * recorded screenshots; a Desktop upgrade means re-measuring here and running
 * `bun run smoke:desktop <out-dir>`.
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
export const WINDOW = { width: 1100, height: 900 }
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

/**
 * The header button that shows and hides a session's details (its Environment and Context), which
 * Desktop opens beside every new session. Desktop binds no key to it.
 */
export const SESSION_DETAILS_TOGGLE: Point = { x: 803, y: 18 }
/** Inside the prompt box whether or not a pane is open, so a click focuses it. */
export const PROMPT_FOCUS: Point = { x: 300, y: WINDOW.height - 60 }
/** The left margin of the main area: clicking it takes focus off the prompt, so no caret blinks. */
export const BLUR: Point = { x: 20, y: WINDOW.height - 170 }
/** Where the mouse rests for screenshots: on the window's right edge, over nothing that hovers. */
export const MOUSE_REST: Point = { x: WINDOW.width - 1, y: CENTER.y }

/** The window's content: Desktop draws no frame around it on Linux. */
export const CONTENT = { left: 0, top: 0, right: WINDOW.width, bottom: WINDOW.height }

/** The prompt box with no pane open, on the window's bottom; the chat column is its width. */
export const PROMPT_BOX: Rect = { x: 166, y: WINDOW.height - 84, width: 768, height: 44 }
/** What the input steps type into: left out of the comparison with the baseline. */
export const PROMPT_TEXT: Rect = {
  x: PROMPT_BOX.x + 2,
  y: PROMPT_BOX.y + 2,
  width: PROMPT_BOX.width - 4,
  height: PROMPT_BOX.height - 4,
}
/** The top of the chat's scrolling area, just under the session header. */
export const CHAT_TOP = 37
/**
 * The foot of the chat's scrollbar, where Desktop draws its down arrow, and the end of its thumb
 * when the chat sits scrolled to its newest message. Desktop draws the scrollbar only while the
 * chat overflows, so the chat has scrolled and cut the element at its top.
 */
export const SCROLLBAR_FOOT: Rect = { x: 1092, y: 876, width: 6, height: 14 }
export const PANE: Rect = {
  x: 733,
  y: CHAT_TOP,
  width: WINDOW.width - 733,
  height: WINDOW.height - CHAT_TOP,
}
/** The pane's title bar, down to and including the line under it. */
const PANE_TITLE_HEIGHT = 44
/**
 * A pane's body, where its mod draws: under its title bar and right of its one-pixel border. Its
 * background is the page's, so a row profile reads its empty rows as blank.
 */
export const PANE_BODY: Rect = {
  x: PANE.x + 1,
  y: PANE.y + PANE_TITLE_HEIGHT,
  width: PANE.width - 1,
  height: PANE.height - PANE_TITLE_HEIGHT,
}
/** The chat column's left edge (its prompt box's border) while a pane is open. */
export const PANE_CHAT_LEFT = 32

export interface Column {
  x: number
  width: number
}

/** The chat column with no pane open: its prompt box, which a band's plate spans. */
export const CHAT_COLUMN: Column = { x: PROMPT_BOX.x, width: PROMPT_BOX.width }
/**
 * The chat's messages, inside the chat column: a reply's text starts at its left edge and a
 * message the user sent ends, in its bubble, at its right edge.
 */
export const MESSAGE_COLUMN: Column = { x: 186, width: 732 }

/**
 * A band's plate pads what a mod draws by 8px, so these strips just inside its left and right
 * edges are plate on every row of a band, however dark the drawing in it.
 */
export const plateStrips = ({ x, width }: Column): Column[] => [
  { x: x + 2, width: 3 },
  { x: x + width - 5, width: 3 },
]

/**
 * The strip on the right edge where the chat's scrollbar shows once it overflows: left out of the
 * comparison and of every crop.
 */
export const SCROLL_GUTTER: Rect = {
  x: 1088,
  y: 0,
  width: WINDOW.width - 1088,
  height: WINDOW.height,
}
/** Space kept around a crop's content so a border is not flush with the edge. */
export const CROP_MARGIN = 8
/**
 * Where a session's turns show with no pane open: the message column, widened by the crop margin
 * as the session's header and a reply's first glyph reach past it, from the chat's top to the
 * prompt box. A theme recolors the window around it.
 */
export const MESSAGE_AREA: Rect = {
  x: MESSAGE_COLUMN.x - CROP_MARGIN,
  y: CHAT_TOP,
  width: MESSAGE_COLUMN.width + 2 * CROP_MARGIN,
  height: PROMPT_BOX.y - CHAT_TOP,
}
/**
 * Inside the prompt box, right of its placeholder. The box keeps Desktop's own fill under any
 * theme, so its grey says whether the window shows light or dark.
 */
export const PROMPT_FILL: Rect = { x: 600, y: PROMPT_BOX.y + 12, width: 300, height: 20 }
export const PANE_MARGIN = 4
/** The tallest a card image is when there is no band to show: about two chat messages. */
export const CARD_MAX_HEIGHT = 150
/**
 * The tallest a pane's card is. A pane is narrow, so its card can be taller, but it stays under
 * the 300px a card frame shows at most (src/ui/desktop-shot.tsx), border included.
 */
export const PANE_CARD_MAX_HEIGHT = 290

/**
 * One-pixel columns that are a border's flat grey only in one layout: the prompt box's left border
 * with no pane, the prompt box's left border beside a pane, and the pane's left border.
 */
export const BORDER_PROBES = {
  prompt: { x: PROMPT_BOX.x, y: PROMPT_BOX.y + 14, width: 1, height: 14 },
  promptBesidePane: { x: PANE_CHAT_LEFT, y: PROMPT_BOX.y + 14, width: 1, height: 14 },
  pane: { x: PANE.x, y: 200, width: 1, height: 400 },
} satisfies Record<string, Rect>

/**
 * One-pixel columns of Desktop's own window with no pane open: the prompt box's left border, and the
 * page just left of it. In light and dark alike they differ only while the chat column sits where
 * these positions assume. A theme may recolor both, so only Desktop's own window is read here.
 */
export const PROMPT_EDGE_PROBES = {
  edge: BORDER_PROBES.prompt,
  page: { ...BORDER_PROBES.prompt, x: PROMPT_BOX.x - CROP_MARGIN },
} satisfies Record<string, Rect>

/** Grey level (0..1) of Desktop's page background in dark theme, around the chat. */
export const PAGE_GREY = 25 / 255
/** Grey levels (0..1) of the borders above, measured: the prompt box's and the pane's. */
export const PROMPT_BORDER_GREY = 64 / 255
export const PANE_BORDER_GREY = 48 / 255
