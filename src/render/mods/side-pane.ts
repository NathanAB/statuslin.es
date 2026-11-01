import { TERMINAL } from './terminal'

/** Shorter runs are boxes in the transcript, such as a tool's output frame. */
const PANE_MIN_ROWS = TERMINAL.rows / 2
// Built with fromCharCode so the ESC doesn't trip Biome's noControlCharactersInRegex (as ansi.ts).
const STYLED_BORDER = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m│`, 'g')

/** The row's last `│` with the style it was drawn in: the replay writes a full style before every change. */
function lastBorder(row: string): { token: string; end: number } | null {
  const match = [...row.matchAll(STYLED_BORDER)].at(-1)
  if (match === undefined) return null
  return { token: match[0], end: match.index + match[0].length }
}

/**
 * What a mod draws in a pane on the right of the screen, as rows: everything right of a border the
 * baseline never draws, on the longest run of rows that border runs down. Rows carry no columns
 * (wide characters, dropped padding), so the border is found by its styled text, not its column.
 */
export function sidePaneRows(
  baseline: readonly string[],
  modScreen: readonly string[],
): string[] | null {
  const borders = modScreen.map(lastBorder)
  const inBaseline = (token: string) => baseline.some((row) => row.includes(token))
  let best: { start: number; length: number } | null = null
  let start = 0
  for (let y = 0; y <= borders.length; y++) {
    const token = borders[y]?.token
    if (token !== undefined && token === borders[start]?.token) continue
    const length = y - start
    const startToken = borders[start]?.token
    if (startToken !== undefined && !inBaseline(startToken) && length > (best?.length ?? 0)) {
      best = { start, length }
    }
    start = y
  }
  if (best === null || best.length < PANE_MIN_ROWS) return null
  return modScreen
    .slice(best.start, best.start + best.length)
    .map((row, i) => row.slice(borders[best.start + i]?.end))
}
