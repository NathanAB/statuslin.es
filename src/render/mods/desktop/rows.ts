import { CARD_MAX_HEIGHT, CHAT_TOP, CROP_MARGIN } from './screen'

/**
 * A shot read row by row: for each CSS row, the share (0..1) of a column that is not page
 * background. It is enough to find Desktop's band plate and the blank gaps between chat elements.
 */
export type RowProfile = readonly number[]

/** A band's plate fills its column edge to edge, give or take a rounded corner. */
const PLATE_MIN = 0.9
/** Desktop leaves about 6px between a band's plate and the prompt box, more at its corners. */
const BAND_GAP_MAX = 12
const BAND_MIN_ROWS = 8
/**
 * Unscrolled, the chat's first message starts about 50px under its top. Content this close to the
 * top means the chat has scrolled and the element there is cut.
 */
const CUT_SLACK = 12
/** A card is cut at a blank row only this far down at least, so it never comes out a sliver. */
const CARD_MIN_HEIGHT = 60

const isBlank = (share: number | undefined) => share === 0

/** The plate Desktop draws a band (AbovePrompt) on, ending just above the prompt box. */
export function bandAbovePrompt(
  rows: RowProfile,
  promptTop: number,
): { top: number; bottom: number } | null {
  let y = promptTop - 1
  for (let gap = 0; y >= 0 && (rows[y] ?? 0) < PLATE_MIN && gap < BAND_GAP_MAX; gap++) y--
  const bottom = y
  while (y >= 0 && (rows[y] ?? 0) >= PLATE_MIN) y--
  const top = y + 1
  return bottom - top + 1 >= BAND_MIN_ROWS ? { top, bottom } : null
}

/**
 * Where a crop meant to start at `top` should start so it cuts no element in half: below the
 * element a scrolled chat cuts at its top, or else up at the blank row above the element `top`
 * lands in.
 */
export function uncutTop(rows: RowProfile, top: number): number {
  const first = rows.findIndex((share, y) => y >= CHAT_TOP && !isBlank(share))
  if (first !== -1 && first < CHAT_TOP + CUT_SLACK) {
    const gap = rows.findIndex((share, y) => y > first && isBlank(share))
    return Math.max(top, gap === -1 ? first : gap)
  }
  let y = top
  while (y > CHAT_TOP && !isBlank(rows[y])) y--
  return y
}

/**
 * Rows of a message the user sent: Desktop draws it as a bubble against the column's right edge,
 * clear of its left edge, read across the column's two plate strips.
 */
export function userBubbleRows(left: RowProfile, right: RowProfile): boolean[] {
  return right.map((share, y) => !isBlank(share) && isBlank(left[y]))
}

/** Rows `from` to `from + rows` of a shot, left out of its crop. */
export interface RowCut {
  from: number
  rows: number
}

/** The space a crop keeps between two kept parts: the crop margin below one and above the next. */
export const KEPT_GAP = 2 * CROP_MARGIN

/**
 * The cuts that leave only the kept rows of [top, bottom), as the terminal crop keeps only changed
 * rows: everything above the first and below the last down to the crop margin, and every stretch
 * between two kept rows longer than KEPT_GAP down to it. Top to bottom; null when no row is kept.
 */
export function keptRowCuts(
  kept: readonly boolean[],
  top: number,
  bottom: number,
): RowCut[] | null {
  const rows: number[] = []
  for (let y = top; y < bottom; y++) if (kept[y]) rows.push(y)
  const first = rows[0]
  const last = rows.at(-1)
  if (first === undefined || last === undefined) return null
  const cuts: RowCut[] = []
  if (first - CROP_MARGIN > top) cuts.push({ from: top, rows: first - CROP_MARGIN - top })
  for (const [i, y] of rows.entries()) {
    const next = rows[i + 1]
    if (next !== undefined && next - y - 1 > KEPT_GAP) {
      cuts.push({ from: y + 1 + CROP_MARGIN, rows: next - y - 1 - KEPT_GAP })
    }
  }
  const end = last + 1 + CROP_MARGIN
  if (end < bottom) cuts.push({ from: end, rows: bottom - end })
  return cuts
}

/** The first and last rows in [top, bottom) that hold anything; null when all are blank. */
export function drawnRows(
  rows: RowProfile,
  top: number,
  bottom: number,
): { top: number; bottom: number } | null {
  let first = top
  while (first < bottom && isBlank(rows[first])) first++
  if (first === bottom) return null
  let last = bottom - 1
  while (isBlank(rows[last])) last--
  return { top: first, bottom: last }
}

/** Where a card starting at `top` ends: `maxHeight` down at most, at a blank row if one is near. */
export function cardBottom(
  rows: RowProfile,
  top: number,
  limit: number,
  maxHeight: number = CARD_MAX_HEIGHT,
): number {
  const end = Math.min(top + maxHeight, limit)
  for (let y = end - 1; y >= top + CARD_MIN_HEIGHT; y--) {
    if (isBlank(rows[y])) return y + 1
  }
  return end
}
