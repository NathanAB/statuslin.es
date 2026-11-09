/** The recording terminal's size, which also bounds where an input step can click. */
export const TERMINAL = { cols: 100, rows: 30 }

/** How a mod's terminal preview is recorded; `rows` is for a pane taller than `TERMINAL.rows`. */
export type TerminalSetup = { cols: number; rows?: number | undefined; fullscreen: boolean }

export const DEFAULT_TERMINAL_SETUP: TerminalSetup = { cols: TERMINAL.cols, fullscreen: false }

/** A row restyled at every cell this wide still fits the per-row byte cap. */
export const MAX_TERMINAL_COLS = 160
/** Tall enough for a full pane, and it keeps a recording within its byte cap. */
export const MAX_TERMINAL_ROWS = 60
