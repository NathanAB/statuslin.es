import { TERMINAL } from './terminal'

/** Shorter runs are boxes in the transcript, such as a tool's output frame. */
const PANE_MIN_ROWS = TERMINAL.rows / 2
// Built with fromCharCode so the ESC doesn't trip Biome's noControlCharactersInRegex (as ansi.ts).
const STYLED_BORDER = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m│`, 'g')

/** Each `│` with the style it was drawn in: the replay writes a full style before every change. */
const borderTokens = (row: string) => new Set(row.match(STYLED_BORDER))

type Pane = { token: string; start: number; length: number }

/** The longest run of consecutive rows that all hold `token`. */
function longestRun(
  rows: readonly Set<string>[],
  token: string,
): { start: number; length: number } {
  let best = { start: 0, length: 0 }
  let start = 0
  for (let y = 0; y <= rows.length; y++) {
    if (rows[y]?.has(token)) continue
    if (y - start > best.length) best = { start, length: y - start }
    start = y + 1
  }
  return best
}

/**
 * The border that runs down the most rows of `screen`. Rows carry no columns (wide characters,
 * dropped padding), so the border is found by its styled text.
 */
function findPane(screen: readonly string[]): Pane | null {
  const tokens = screen.map(borderTokens)
  let pane: Pane | null = null
  for (const token of new Set(tokens.flatMap((set) => [...set]))) {
    const run = longestRun(tokens, token)
    if (run.length > (pane?.length ?? 0)) pane = { token, ...run }
  }
  return pane !== null && pane.length >= PANE_MIN_ROWS ? pane : null
}

/** Everything right of the pane's border; a row the border does not reach has nothing in the pane. */
function paneRows(screen: readonly string[], { token, start, length }: Pane): string[] {
  return screen.slice(start, start + length).map((row) => {
    const at = row.indexOf(token)
    return at === -1 ? '' : row.slice(at + token.length)
  })
}

/**
 * What a mod draws in a pane on the right of the screen, as rows. Claude Code draws panes of its
 * own in the same frame (a diff of the session's edits, at 144 columns), so the pane is the mod's
 * only when what is in it differs from the baseline's.
 */
export function sidePaneRows(
  baseline: readonly string[],
  modScreen: readonly string[],
): string[] | null {
  const pane = findPane(modScreen)
  if (pane === null) return null
  const rows = paneRows(modScreen, pane)
  const baselineRows = paneRows(baseline, pane)
  return rows.every((row, i) => row === baselineRows[i]) ? null : rows
}
