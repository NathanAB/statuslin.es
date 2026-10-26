import { parseAnsi } from '@/render/ansi'
import type { AnsiSegment } from '@/render/types'

/** A rewrite applied to every row of both screens before they are compared. Kept rows show the real text. */
export type RowMask = { name: string; pattern: RegExp; replacement: string }

export type CropResult = { kind: 'rendered'; segments: AnsiSegment[] } | { kind: 'not-rendered' }

/** Claude Code's turn-duration row has a random verb and the wall-clock time, so two recordings of one session differ there. */
const TURN_DURATION_MASKS: readonly RowMask[] = [
  { name: 'turn-duration verb', pattern: /\p{Lu}\p{Ll}+ for \d+s/gu, replacement: 'VERB for Ns' },
  { name: 'clock', pattern: /\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b/g, replacement: 'HH:MM' },
]

/** The prompt, and every message typed at it: Claude Code's, unless the mod restyled what was typed. */
const PROMPT_ROW = /^❯(?:\s|$)/
/** A prompt row with something typed at it, unlike the empty prompt and its cursor. */
const TYPED_PROMPT = /^❯\s*\S/
/** Claude Code's permission-mode hint, on the footer row a mod can add its own entry to. */
const MODE_HINT = /⏵⏵ .*?\(shift\+tab to cycle\)(?: · ← for agents)?/u
// Built with fromCharCode so the ESC doesn't trip Biome's noControlCharactersInRegex (as ansi.ts).
const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'y')

/** Rows are compared as SGR-styled strings by longest common subsequence, so a row that only moved up or down is never kept. */
export function cropModPreview(
  baseline: readonly string[],
  modScreen: readonly string[],
  modMasks: readonly RowMask[] = [],
): CropResult {
  const masks = [...TURN_DURATION_MASKS, ...modMasks]
  const masked = (row: string) => masks.reduce((r, m) => r.replace(m.pattern, m.replacement), row)
  const common = modRowsOnCommonSubsequence(baseline.map(masked), modScreen.map(masked))
  const text = (row: string) => plainText(masked(row)).trim()
  // The baseline types the same input steps, so a prompt row with its text is one the mod restyled.
  const typedPrompts = new Set(baseline.map(text).filter((row) => TYPED_PROMPT.test(row)))
  const kept = modScreen.flatMap((row, y) => {
    if (common.has(y)) return []
    const rowText = text(row)
    if (PROMPT_ROW.test(rowText) && !typedPrompts.has(rowText)) return []
    const modOnly = blankMatch(row, MODE_HINT)
    return showsNothing(modOnly) ? [] : [modOnly]
  })
  if (kept.length === 0) return { kind: 'not-rendered' }

  return { kind: 'rendered', segments: parseAnsi(kept.join('\n')) }
}

/** `row` with the text `pattern` matches turned to spaces, its styles left as they were. */
function blankMatch(row: string, pattern: RegExp): string {
  const match = pattern.exec(plainText(row))
  if (!match) return row
  const end = match.index + match[0].length
  let out = ''
  let textAt = 0
  for (let i = 0; i < row.length; ) {
    SGR.lastIndex = i
    const sgr = SGR.exec(row)
    if (sgr) {
      out += sgr[0]
      i += sgr[0].length
      continue
    }
    out += textAt >= match.index && textAt < end ? ' ' : row[i]
    textAt++
    i++
  }
  return out
}

/** A space with a background colour is a pixel, as pixel-art mods draw them. */
function showsNothing(row: string): boolean {
  return parseAnsi(row).every((segment) => segment.text.trim() === '' && !segment.bg)
}

function plainText(row: string): string {
  return parseAnsi(row)
    .map((segment) => segment.text)
    .join('')
}

/**
 * The indexes of `mod`'s rows on a longest common subsequence with `baseline`'s, rows matching
 * when `same` says so: a row that only moved up or down is on it.
 */
export function modRowsOnCommonSubsequence<Row>(
  baseline: readonly Row[],
  mod: readonly Row[],
  same: (a: Row, b: Row) => boolean = (a, b) => a === b,
): Set<number> {
  const width = mod.length + 1
  const lengths = new Uint32Array((baseline.length + 1) * width)
  const at = (i: number, j: number) => lengths[i * width + j] ?? 0
  // Both indexes are in range wherever this is called.
  const matches = (i: number, j: number) => same(baseline[i] as Row, mod[j] as Row)
  for (let i = baseline.length - 1; i >= 0; i--) {
    for (let j = mod.length - 1; j >= 0; j--) {
      lengths[i * width + j] = matches(i, j)
        ? at(i + 1, j + 1) + 1
        : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const matched = new Set<number>()
  let i = 0
  let j = 0
  while (i < baseline.length && j < mod.length) {
    if (matches(i, j)) {
      matched.add(j)
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) i++
    else j++
  }
  return matched
}
