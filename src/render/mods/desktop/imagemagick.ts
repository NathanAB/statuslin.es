import { type Rect, SCALE } from './screen'

/**
 * ImageMagick commands run inside the Desktop sandbox, and parsers for what they print. Rects are
 * CSS pixels; the screen and its shots are device pixels (CSS times SCALE). Everything printed
 * comes from a sandbox a mod has run in, so the parsers accept only the exact expected shape.
 */

const geometry = ({ x, y, width, height }: Rect) =>
  `${width * SCALE}x${height * SCALE}+${x * SCALE}+${y * SCALE}`

export function screenshotCommand(path: string): string {
  return `import -window root -strip ${path}`
}

/** Grey mean and standard deviation (both 0..1) of each region, one line per region. */
export function probeCommand(
  path: string,
  regions: readonly Rect[],
  { capture = true }: { capture?: boolean } = {},
): string {
  const reads = regions.map(
    (r) =>
      `convert ${path} -crop ${geometry(r)} +repage -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]\\n' info:`,
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
    `convert ${baseline} ${shot}`,
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

export function cropCommand(source: string, rect: Rect, dest: string): string {
  return `convert ${source} -crop ${geometry(rect)} +repage -strip ${dest}`
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
