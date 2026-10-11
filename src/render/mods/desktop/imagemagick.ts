import { shellQuote } from '../session'
import type { RowCut } from './rows'
import { type Rect, SCALE, WINDOW } from './screen'

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

/** A pixel's grey difference under this is noise, like the fade Desktop lays over a scrolled chat. */
const FAINT_CHANGE = '2%'

const rectangle = ({ x, y, width, height }: Rect) =>
  `-draw 'rectangle ${x * SCALE},${y * SCALE} ${(x + width) * SCALE - 1},${(y + height) * SCALE - 1}'`

/**
 * Prints whether the shots differ anywhere outside `masks`, and the trim box of the difference.
 * The one-pixel black border keeps that box defined when nothing differs.
 */
export function changedBoxCommand(baseline: string, shot: string, masks: readonly Rect[]): string {
  return [
    `convert ${pngInput(baseline)} ${pngInput(shot)}`,
    '-compose difference -composite',
    ['-compose over -fill black', ...masks.map(rectangle)].join(' '),
    `-colorspace Gray -threshold ${FAINT_CHANGE} -bordercolor black -border 1`,
    `-format '%[fx:maxima] %@' info:`,
  ].join(' ')
}

/** Desktop's page background in dark theme, around the chat. */
const PAGE_BACKGROUND = 'gray(21)'
/** Off the page background by more than this, a pixel is content: the 20/21 grey jitter is not. */
const NOT_BACKGROUND = '3%'

/**
 * For each CSS row, the share of `columns` (side by side) that is not page background, as one byte
 * (0-255) per row: Desktop's band plate fills a row, and a blank row between chat elements is 0.
 */
export function rowProfileCommand(
  path: string,
  columns: readonly { x: number; width: number }[],
): string {
  const strips = columns.map(
    ({ x, width }) =>
      `\\( -clone 0 -crop ${geometry({ x, y: 0, width, height: WINDOW.height })} +repage \\)`,
  )
  return [
    `set -o pipefail; convert ${pngInput(path)} ${strips.join(' ')} -delete 0 +append`,
    `\\( +clone -fill '${PAGE_BACKGROUND}' -colorize 100% \\) -compose difference -composite`,
    `-colorspace Gray -threshold ${NOT_BACKGROUND} -scale 1x${WINDOW.height}! -depth 8 gray:- | od -An -v -tu1`,
  ].join(' ')
}

const BYTE = /^\d{1,3}$/

export function parseRowProfile(stdout: string, rows: number): number[] {
  const values = stdout.split(/\s+/).filter((v) => v !== '')
  if (values.length !== rows)
    throw new Error(`expected a ${rows}-row row profile, got ${values.length}`)
  return values.map((value) => {
    const byte = Number(value)
    if (!BYTE.test(value) || byte > 255) throw new Error('unreadable row profile')
    return byte / 255
  })
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
 * The crop, with `cuts` (shot rows) chopped out, re-encoded from its pixels alone to stdout: no
 * metadata, no text, one frame. It is what gets stored and served, so nothing a mod hid in the
 * shot's file survives it.
 */
export function croppedPngCommand(
  source: string,
  rect: Rect,
  cuts: readonly RowCut[] = [],
): string {
  // From the bottom up, so each chop leaves the rows above it where the next one expects them.
  const chops = [...cuts]
    .sort((a, b) => b.from - a.from)
    .map(({ from, rows }) => `-chop 0x${rows * SCALE}+0+${(from - rect.y) * SCALE}`)
  return [
    `convert ${pngInput(source)} -crop ${geometry(rect)} +repage`,
    ...(chops.length > 0 ? [...chops, '+repage'] : []),
    '-strip -define png:exclude-chunks=all png:-',
  ].join(' ')
}

/** For each CSS row of `column`, the share of it that differs from the baseline, as one byte per row. */
export function changedRowProfileCommand(
  baseline: string,
  shot: string,
  { x, width }: { x: number; width: number },
): string {
  const crop = geometry({ x, y: 0, width, height: WINDOW.height })
  return [
    `set -o pipefail; convert ${pngInput(baseline)} ${pngInput(shot)} -compose difference -composite`,
    `-crop ${crop} +repage -colorspace Gray -threshold ${FAINT_CHANGE}`,
    `-scale 1x${WINDOW.height}! -depth 8 gray:- | od -An -v -tu1`,
  ].join(' ')
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
  const poll = [
    `${screenshotCommand(path)} || exit 1`,
    `sum=$(md5sum < ${path})`,
    'now=$(date +%s%3N)',
    `if [ "$sum" = "$last" ]; then [ $((now - since)) -ge ${quietMs} ] && exit 0; else last=$sum; since=$now; fi`,
    `sleep ${pollMs / 1000}`,
  ].join('; ')
  // Wall-clock bounds: a screenshot of a busy screen can take most of a poll.
  return `end=$(( $(date +%s%3N) + ${maxMs} )); last=; since=0; while [ "$(date +%s%3N)" -lt "$end" ]; do ${poll}; done`
}
