// Replays recorded pty bytes through a headless xterm and prints the visible screen as a JSON array
// with one SGR-styled string per row. It runs as `user` in a fresh sandbox that no mod code has run
// in, because the bytes are hostile: xterm can be driven out of memory or time, and that ends only
// this sandbox. The host caps what it prints.
//   node replay.cjs <@xterm/headless package dir> <recording> <cols> <rows>
const { readFileSync } = require('node:fs')

process.on('uncaughtException', (error) => {
  process.stderr.write(String(error?.message))
  process.exit(1)
})

const [xtermDir, recordingPath, cols, rows] = process.argv.slice(2)
const { Terminal } = require(xtermDir)
const term = new Terminal({
  cols: Number(cols),
  rows: Number(rows),
  allowProposedApi: true,
  scrollback: 0,
})
const RESET = '0'

function colorParams(isRgb, isPalette, value, base) {
  if (isRgb) return [base + 8, 2, (value >> 16) & 255, (value >> 8) & 255, value & 255]
  if (!isPalette) return []
  if (value < 8) return [base + value]
  if (value < 16) return [base + 60 + value - 8]
  return [base + 8, 5, value]
}

/** An inverse cell swaps its colours; a default colour becomes black on white. */
function cellStyle(cell) {
  let fg = colorParams(cell.isFgRGB(), cell.isFgPalette(), cell.getFgColor(), 30)
  let bg = colorParams(cell.isBgRGB(), cell.isBgPalette(), cell.getBgColor(), 40)
  if (cell.isInverse()) {
    const swappedFg = bg.length ? [bg[0] - 10, ...bg.slice(1)] : [30]
    const swappedBg = fg.length ? [fg[0] + 10, ...fg.slice(1)] : [47]
    fg = swappedFg
    bg = swappedBg
  }
  const flags = []
  if (cell.isBold()) flags.push(1)
  if (cell.isDim()) flags.push(2)
  if (cell.isItalic()) flags.push(3)
  if (cell.isUnderline()) flags.push(4)
  return [RESET, ...flags, ...fg, ...bg].join(';')
}

/** Unstyled spaces are held back, so a row never ends in padding. */
function serializeRow(line, cell) {
  let out = ''
  let current = RESET
  let pendingSpaces = ''
  for (let x = 0; x < term.cols; x++) {
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

term.write(readFileSync(recordingPath), () => {
  const buffer = term.buffer.active
  const cell = buffer.getNullCell()
  const screen = []
  for (let y = 0; y < term.rows; y++) {
    const line = buffer.getLine(buffer.viewportY + y)
    screen.push(line ? serializeRow(line, cell) : '')
  }
  process.stdout.write(JSON.stringify(screen))
})
