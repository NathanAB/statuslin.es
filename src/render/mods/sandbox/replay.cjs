// Replays a recorded pty byte stream through a headless xterm and prints the visible screen as a
// JSON array with one SGR-styled string per row. Runs inside the sandbox, with NODE_PATH set to
// the template's replay node_modules: node replay.cjs <recording> <cols> <rows>
const { readFileSync } = require('node:fs')
const { Terminal } = require('@xterm/headless')

const [recordingPath, cols, rows] = process.argv.slice(2)
const term = new Terminal({
  cols: Number(cols),
  rows: Number(rows),
  allowProposedApi: true,
  scrollback: 0,
})

function colorParams(isRgb, isPalette, value, base) {
  if (isRgb) return [base + 8, 2, (value >> 16) & 255, (value >> 8) & 255, value & 255]
  if (!isPalette) return []
  if (value < 8) return [base + value]
  if (value < 16) return [base + 60 + value - 8]
  return [base + 8, 5, value]
}

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
  return [0, ...flags, ...fg, ...bg].join(';')
}

/** Unstyled spaces are held back, so a row never ends in padding. */
function serializeRow(line) {
  const cell = term.buffer.active.getNullCell()
  let out = ''
  let current = '0'
  let pendingSpaces = ''
  for (let x = 0; x < term.cols; x++) {
    line.getCell(x, cell)
    if (cell.getWidth() === 0) continue
    const chars = cell.getChars() || ' '
    const style = cellStyle(cell)
    if (chars === ' ' && style === '0') {
      pendingSpaces += ' '
      continue
    }
    if (pendingSpaces) {
      if (current !== '0') out += '\u001b[0m'
      current = '0'
      out += pendingSpaces
      pendingSpaces = ''
    }
    if (style !== current) {
      out += `\u001b[${style}m`
      current = style
    }
    out += chars
  }
  if (current !== '0') out += '\u001b[0m'
  return out
}

term.write(readFileSync(recordingPath), () => {
  const buffer = term.buffer.active
  const screen = []
  for (let y = 0; y < term.rows; y++) {
    const line = buffer.getLine(buffer.viewportY + y)
    screen.push(line ? serializeRow(line) : '')
  }
  process.stdout.write(JSON.stringify(screen))
})
