import { type IBufferCell, type IBufferLine, Terminal } from '@xterm/headless'
import { TERMINAL } from './session'

/**
 * A row restyled at every cell with truecolor fg and bg plus every flag serializes to about 4.5 KB
 * (see the replay test); the rest is headroom. Combining marks pile up in one cell without limit,
 * so a row past this is refused rather than stored.
 */
export const ROW_MAX_BYTES = 6_000
/** The recorded screens so far are 2 to 4 KB, so this leaves over ten times their size. */
export const SCREEN_MAX_BYTES = 64 * 1024
/**
 * `CSI n b` repeats the last character n times, up to 2^31 for 4 bytes, and xterm allocates and
 * prints every one. A hundred screens of repeats cost milliseconds; past that the replay is refused.
 */
export const REPEAT_MAX_CELLS = 100 * TERMINAL.cols * TERMINAL.rows

const RESET = '0'

function colorParams(isRgb: boolean, isPalette: boolean, value: number, base: number): number[] {
  if (isRgb) return [base + 8, 2, (value >> 16) & 255, (value >> 8) & 255, value & 255]
  if (!isPalette) return []
  if (value < 8) return [base + value]
  if (value < 16) return [base + 60 + value - 8]
  return [base + 8, 5, value]
}

/** An inverse cell swaps its colours; a default colour becomes black on white. */
function cellStyle(cell: IBufferCell): string {
  let fg = colorParams(cell.isFgRGB(), cell.isFgPalette(), cell.getFgColor(), 30)
  let bg = colorParams(cell.isBgRGB(), cell.isBgPalette(), cell.getBgColor(), 40)
  if (cell.isInverse()) {
    const [bgBase = 0, ...bgRest] = bg
    const [fgBase = 0, ...fgRest] = fg
    const swappedFg = bg.length ? [bgBase - 10, ...bgRest] : [30]
    const swappedBg = fg.length ? [fgBase + 10, ...fgRest] : [47]
    fg = swappedFg
    bg = swappedBg
  }
  const flags: number[] = []
  if (cell.isBold()) flags.push(1)
  if (cell.isDim()) flags.push(2)
  if (cell.isItalic()) flags.push(3)
  if (cell.isUnderline()) flags.push(4)
  return [RESET, ...flags, ...fg, ...bg].join(';')
}

/** Unstyled spaces are held back, so a row never ends in padding. */
function serializeRow(line: IBufferLine, cell: IBufferCell): string {
  let out = ''
  let current = RESET
  let pendingSpaces = ''
  for (let x = 0; x < TERMINAL.cols; x++) {
    line.getCell(x, cell)
    if (cell.getWidth() === 0) continue
    const chars = cell.getChars() || ' '
    const style = cellStyle(cell)
    if (chars === ' ' && style === RESET) {
      pendingSpaces += ' '
      continue
    }
    if (pendingSpaces) {
      if (current !== RESET) out += '\u001b[0m'
      current = RESET
      out += pendingSpaces
      pendingSpaces = ''
    }
    if (style !== current) {
      out += `\u001b[${style}m`
      current = style
    }
    out += chars
  }
  if (current !== RESET) out += '\u001b[0m'
  return out
}

/**
 * Plays recorded pty bytes into a headless terminal on the host and returns the visible screen,
 * one SGR-styled string per row. The bytes come from mod code, so the result is capped.
 */
export async function replayScreen(recording: Uint8Array): Promise<string[]> {
  const term = new Terminal({ ...TERMINAL, allowProposedApi: true, scrollback: 0 })
  let repeatedCells = 0
  term.parser.registerCsiHandler({ final: 'b' }, ([count]) => {
    repeatedCells += typeof count === 'number' && count > 0 ? count : 1
    return repeatedCells > REPEAT_MAX_CELLS
  })
  try {
    await new Promise<void>((resolve) => term.write(recording, resolve))
    if (repeatedCells > REPEAT_MAX_CELLS) {
      throw new Error(`recording repeats more than ${REPEAT_MAX_CELLS} cells`)
    }
    const buffer = term.buffer.active
    const cell = buffer.getNullCell()
    const rows: string[] = []
    let screenBytes = 0
    for (let y = 0; y < TERMINAL.rows; y++) {
      const line = buffer.getLine(buffer.viewportY + y)
      const row = line ? serializeRow(line, cell) : ''
      const rowBytes = Buffer.byteLength(row)
      if (rowBytes > ROW_MAX_BYTES) throw new Error(`row ${y + 1} is over ${ROW_MAX_BYTES} bytes`)
      screenBytes += rowBytes
      if (screenBytes > SCREEN_MAX_BYTES)
        throw new Error(`screen is over ${SCREEN_MAX_BYTES} bytes`)
      rows.push(row)
    }
    return rows
  } finally {
    term.dispose()
  }
}
