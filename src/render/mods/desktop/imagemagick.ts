import { shellQuote } from '../session'
import { type Rect, SCALE } from './screen'

/**
 * ImageMagick commands run inside the Desktop sandboxes, and parsers for what they print. Rects
 * are CSS pixels; the screen and its shots are device pixels (CSS times SCALE). Every shot is
 * hostile bytes, so it is read with the PNG decoder only (never by sniffing, which would run other
 * coders) and only its first frame; the parsers accept only the exact expected shape.
 */

const geometry = ({ x, y, width, height }: Rect) =>
  `${width * SCALE}x${height * SCALE}+${x * SCALE}+${y * SCALE}`

const pngInput = (path: string) => shellQuote(`png:${path}[0]`)

export function screenshotCommand(path: string): string {
  return `import -window root -strip ${path}`
}

/** The whole virtual display as PNG bytes on stdout. */
export const SCREEN_PNG_COMMAND = screenshotCommand('png:-')

/** Prints the PNG `command` writes to stdout as one line of base64, the only shape read back. */
export function printedPngCommand(command: string): string {
  return `set -o pipefail; ${command} | base64 -w0`
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export function parsePrintedPng(stdout: string): Uint8Array {
  const text = stdout.trim()
  if (!BASE64.test(text)) throw new Error('unreadable printed PNG')
  return new Uint8Array(Buffer.from(text, 'base64'))
}

/** Grey mean and standard deviation (both 0..1) of each region, one line per region. */
export function probeCommand(
  path: string,
  regions: readonly Rect[],
  { capture = true }: { capture?: boolean } = {},
): string {
  const reads = regions.map(
    (r) =>
      `convert ${pngInput(path)} -crop ${geometry(r)} +repage -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]\\n' info:`,
  )
  return [...(capture ? [screenshotCommand(path)] : []), ...reads].join(' && ')
}

export interface RegionGrey {
  mean: number
  deviation: number
}

const UNIT = String.raw`(?:0|1|0?\.\d+|\d(?:\.\d+)?e-\d+)`
const PROBE_LINE = new RegExp(`^(${UNIT}) (${UNIT})$`)

export function parseProbes(stdout: string, count: number): RegionGrey[] {
  const lines = stdout.split('\n').filter((line) => line !== '')
  if (lines.length !== count) throw new Error(`expected ${count} probe lines, got ${lines.length}`)
  return lines.map((line) => {
    const match = PROBE_LINE.exec(line)
    const mean = Number(match?.[1])
    const deviation = Number(match?.[2])
    if (!match || mean > 1 || deviation > 1) throw new Error('unreadable probe line')
    return { mean, deviation }
  })
}

/**
 * Prints whether the shots differ anywhere outside `mask`, and the trim box of the difference. The
 * one-pixel black border keeps that box defined when nothing differs.
 */
export function changedBoxCommand(baseline: string, shot: string, mask: Rect): string {
  const left = mask.x * SCALE
  const top = mask.y * SCALE
  const right = (mask.x + mask.width) * SCALE - 1
  const bottom = (mask.y + mask.height) * SCALE - 1
  return [
    `convert ${pngInput(baseline)} ${pngInput(shot)}`,
    '-compose difference -composite',
    `-compose over -fill black -draw 'rectangle ${left},${top} ${right},${bottom}'`,
    '-colorspace Gray -threshold 0 -bordercolor black -border 1',
    `-format '%[fx:maxima] %@' info:`,
  ].join(' ')
}

const CHANGED_BOX = /^([01]) (\d+)x(\d+)\+(\d+)\+(\d+)$/

/** The changed region in CSS pixels, rounded outward; null when the shots are the same. */
export function parseChangedBox(stdout: string): Rect | null {
  const match = CHANGED_BOX.exec(stdout.trim())
  if (!match) throw new Error('unreadable shot comparison')
  const [, differs, w, h, bx, by] = match.map(Number)
  if (differs === 0) return null
  const left = Math.floor((Number(bx) - 1) / SCALE)
  const top = Math.floor((Number(by) - 1) / SCALE)
  const right = Math.ceil((Number(bx) - 1 + Number(w)) / SCALE)
  const bottom = Math.ceil((Number(by) - 1 + Number(h)) / SCALE)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The crop, re-encoded from its pixels alone to stdout: no metadata, no text, one frame. It is
 * what gets stored and served, so nothing a mod hid in the shot's file survives it.
 */
export function croppedPngCommand(source: string, rect: Rect): string {
  return `convert ${pngInput(source)} -crop ${geometry(rect)} +repage -strip -define png:exclude-chunks=all png:-`
}

export interface QuietOptions {
  /** The screen counts as settled once it is unchanged for this long. */
  quietMs: number
  /** An animated screen never settles; it is taken as it stands after this long. */
  maxMs: number
  pollMs: number
}

/** Waits inside the sandbox until the screen stops changing, bounded by `maxMs`. */
export function quietScreenCommand(path: string, { quietMs, maxMs, pollMs }: QuietOptions): string {
  const polls = Math.ceil(maxMs / pollMs)
  const needed = Math.ceil(quietMs / pollMs)
  const poll = [
    `${screenshotCommand(path)} || exit 1`,
    `sum=$(md5sum < ${path})`,
    'if [ "$sum" = "$last" ]; then same=$((same + 1)); else same=0; fi',
    'last=$sum',
    `test $same -ge ${needed} && exit 0`,
    `sleep ${pollMs / 1000}`,
  ].join('; ')
  return `last=; same=0; for i in $(seq 1 ${polls}); do ${poll}; done`
}
