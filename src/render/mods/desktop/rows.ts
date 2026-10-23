import { modRowsOnCommonSubsequence } from '../crop'
import { CARD_MAX_HEIGHT, CHAT_TOP, CROP_MARGIN, PROMPT_BOX } from './screen'

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

/** The prompt box's rounded top corners keep its first rows off the plate strips. */
const PROMPT_CORNER_ROWS = 5

/**
 * The prompt box's top: it grows upward a line at a time as a draft wraps, from PROMPT_BOX, the
 * one-line box, read from where its plate starts above its middle row.
 */
export function promptTop(plate: RowProfile): number {
  let y = PROMPT_BOX.y + PROMPT_BOX.height / 2
  if ((plate[y] ?? 0) < PLATE_MIN) return PROMPT_BOX.y
  while (y > 0 && (plate[y - 1] ?? 0) >= PLATE_MIN) y--
  return Math.min(PROMPT_BOX.y, y - PROMPT_CORNER_ROWS)
}

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

/** Each marked row spread to the whole element it is in: the run of rows between two blank ones. */
export function wholeElements(marked: readonly boolean[], rows: RowProfile): boolean[] {
  const spread = marked.map(() => false)
  for (const [y, mark] of marked.entries()) {
    if (!mark || spread[y]) continue
    let top = y
    while (top > 0 && !isBlank(rows[top - 1])) top--
    let bottom = y
    while (bottom < marked.length - 1 && !isBlank(rows[bottom + 1])) bottom++
    spread.fill(true, top, bottom + 1)
  }
  return spread
}

/** A row's signature: one bit per cell across the crop, set where the cell holds anything. */
export type RowSignature = Uint8Array

/** Two rows this many cells apart or fewer are one row: antialiasing moves an edge a cell or two. */
export const SIGNATURE_TOLERANCE = 2

function cellsSet(byte: number): number {
  let cells = 0
  for (let b = byte; b > 0; b >>= 1) cells += b & 1
  return cells
}

const cellsApart = (a: RowSignature, b: RowSignature) =>
  a.reduce((cells, byte, i) => cells + cellsSet(byte ^ (b[i] ?? 0)), 0)
const sameRow = (a: RowSignature, b: RowSignature) => cellsApart(a, b) <= SIGNATURE_TOLERANCE
const isDrawn = (row: RowSignature) => row.some((byte) => byte !== 0)

/**
 * The shot's rows the baseline does not have, as the terminal crop keeps only rows off their
 * common subsequence: a chat element the mod's drawing only pushed down matches its baseline row
 * and is not kept. Only drawn rows are matched, as any blank row would match any other. From
 * `chatBottom` (a band's top, or the prompt box) down, Desktop fixes what it draws in place, so
 * those rows are compared at the same height; above it, the baseline's chat runs down to its
 * prompt box. A blank row is never kept.
 */
export function rowsNotInBaseline(
  shot: readonly RowSignature[],
  baseline: readonly RowSignature[],
  chatBottom: number,
): boolean[] {
  const drawnAbove = (rows: readonly RowSignature[], bottom: number) =>
    rows.flatMap((row, y) => (y < bottom && isDrawn(row) ? [y] : []))
  const shotChat = drawnAbove(shot, chatBottom)
  const baselineChat = drawnAbove(baseline, PROMPT_BOX.y)
  const common = modRowsOnCommonSubsequence(
    baselineChat.map((y) => baseline[y] as RowSignature),
    shotChat.map((y) => shot[y] as RowSignature),
    sameRow,
  )
  const inChat = new Set([...common].map((j) => shotChat[j]))
  return shot.map((row, y) => {
    if (!isDrawn(row)) return false
    if (y < chatBottom) return !inChat.has(y)
    const atSameHeight = baseline[y]
    return !atSameHeight || !sameRow(row, atSameHeight)
  })
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
