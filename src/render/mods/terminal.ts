/** The recording terminal's size, which also bounds where an input step can click. */
export const TERMINAL = { cols: 100, rows: 30 }

/** How a mod's terminal preview is recorded; the rows never change. */
export type TerminalSetup = { cols: number; fullscreen: boolean }

export const DEFAULT_TERMINAL_SETUP: TerminalSetup = { cols: TERMINAL.cols, fullscreen: false }

/** A full row of styled cells this wide still fits the per-row and whole-recording byte caps. */
export const MAX_TERMINAL_COLS = 160
