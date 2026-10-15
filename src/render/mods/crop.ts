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

const PROMPT_ROW = /^❯(?:\s|$)/

/** Rows are compared as SGR-styled strings by longest common subsequence, so a row that only moved up or down is never kept. */
export function cropModPreview(
  baseline: readonly string[],
  modScreen: readonly string[],
  modMasks: readonly RowMask[] = [],
): CropResult {
  const masks = [...TURN_DURATION_MASKS, ...modMasks]
  const masked = (row: string) => masks.reduce((r, m) => r.replace(m.pattern, m.replacement), row)
  const common = modRowsOnCommonSubsequence(baseline.map(masked), modScreen.map(masked))
  const promptRow = lastPromptRow(modScreen)
  const changed = modScreen.flatMap((row, y) =>
    common.has(y) || y === promptRow || plainText(row).trim() === '' ? [] : [y],
  )
  if (changed.length === 0) return { kind: 'not-rendered' }

  const kept = promptRow === -1 ? changed : [...changed, promptRow].sort((a, b) => a - b)
  return { kind: 'rendered', segments: parseAnsi(kept.map((y) => modScreen[y]).join('\n')) }
}

function lastPromptRow(screen: readonly string[]): number {
  for (let y = screen.length - 1; y >= 0; y--) {
    if (PROMPT_ROW.test(plainText(screen[y] ?? '').trimStart())) return y
  }
  return -1
}

function plainText(row: string): string {
  return parseAnsi(row)
    .map((segment) => segment.text)
    .join('')
}

function modRowsOnCommonSubsequence(
  baseline: readonly string[],
  mod: readonly string[],
): Set<number> {
  const width = mod.length + 1
  const lengths = new Uint32Array((baseline.length + 1) * width)
  const at = (i: number, j: number) => lengths[i * width + j] ?? 0
  for (let i = baseline.length - 1; i >= 0; i--) {
    for (let j = mod.length - 1; j >= 0; j--) {
      lengths[i * width + j] =
        baseline[i] === mod[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const matched = new Set<number>()
  let i = 0
  let j = 0
  while (i < baseline.length && j < mod.length) {
    if (baseline[i] === mod[j]) {
      matched.add(j)
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) i++
    else j++
  }
  return matched
}
