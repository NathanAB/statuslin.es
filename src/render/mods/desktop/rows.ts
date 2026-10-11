import { CARD_MAX_HEIGHT, CHAT_TOP } from './screen'

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
 * Desktop leaves about 50px between chat messages. An empty stretch more than twice that is the
 * chat ending well above the band and prompt box, and is cut down to that gap.
 */
export const KEPT_GAP = 50
export const GAP_COLLAPSE_OVER = 100

/** Rows of a crop that hold nothing: page background in the shot, and the same as the baseline. */
export function emptyRows(content: RowProfile, changed: RowProfile): boolean[] {
  return content.map((share, y) => isBlank(share) && isBlank(changed[y]))
}

/** Rows `from` to `from + rows` of a shot, left out of its crop. */
export interface RowCut {
  from: number
  rows: number
}

/**
 * The cuts that bring every empty stretch inside [top, bottom) longer than GAP_COLLAPSE_OVER down
 * to KEPT_GAP, keeping half the gap above what it removes and half below. Top to bottom.
 */
export function gapCuts(empty: readonly boolean[], top: number, bottom: number): RowCut[] {
  const cuts: RowCut[] = []
  let start = -1
  for (let y = top; y <= bottom; y++) {
    const isEmpty = y < bottom && empty[y] === true
    if (isEmpty && start === -1) start = y
    if (!isEmpty && start !== -1) {
      if (y - start > GAP_COLLAPSE_OVER) {
        cuts.push({ from: start + KEPT_GAP / 2, rows: y - start - KEPT_GAP })
      }
      start = -1
    }
  }
  return cuts
}

/** Where a card starting at `top` ends: CARD_MAX_HEIGHT down at most, at a blank row if one is near. */
export function cardBottom(rows: RowProfile, top: number, limit: number): number {
  const end = Math.min(top + CARD_MAX_HEIGHT, limit)
  for (let y = end - 1; y >= top + CARD_MIN_HEIGHT; y--) {
    if (isBlank(rows[y])) return y + 1
  }
  return end
}
