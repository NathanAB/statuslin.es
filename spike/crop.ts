import { parseAnsi } from '@/render/ansi'
import type { AnsiSegment } from '@/render/types'
import type { ScreenRow } from './capture'

/** Indices of `b` rows that sit on the longest common subsequence of `a` and `b`. */
function commonRows(a: string[], b: string[]): Set<number> {
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = lcs[i] as number[]
      const below = lcs[i + 1] as number[]
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number)
    }
  }
  const matched = new Set<number>()
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matched.add(j)
      i++
      j++
    } else if ((lcs[i + 1]?.[j] as number) >= (lcs[i]?.[j + 1] as number)) i++
    else j++
  }
  return matched
}

/**
 * The engine's turn-duration row carries a random spinner verb and the wall-clock time, so two
 * recordings of the same session differ there. Mask both before comparing rows; styling is kept.
 */
export function comparable(ansi: string): string {
  return ansi
    .replace(/\p{Lu}\p{Ll}+ for \d+s/gu, 'VERB for Ns')
    .replace(/\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b/g, 'HH:MM')
}

/** The prompt input row: the line the cursor-side `❯` / `>` marker opens. */
export function promptRowIndex(rows: ScreenRow[]): number | null {
  for (let y = rows.length - 1; y >= 0; y--) {
    const text = (rows[y] as ScreenRow).plain.trimStart()
    if (/^(?:[│|]\s*)?[❯>](?:\s|$)/.test(text)) return y
  }
  return null
}

export type Crop = {
  keptRows: number[]
  promptRow: number | null
  /** Rows that differ at the same index: what a positional diff would keep. */
  positionalDiffRows: number
  segments: AnsiSegment[]
  plain: string[]
  /** The kept rows with the clock and spinner verb masked: equal across runs when the render is stable. */
  comparableKey: string
}

/** Rows of the mod screen not in the baseline (by style-aware LCS), plus the prompt row. */
export function crop(baseline: ScreenRow[], modded: ScreenRow[]): Crop {
  const common = commonRows(
    baseline.map((r) => comparable(r.ansi)),
    modded.map((r) => comparable(r.ansi)),
  )
  const promptRow = promptRowIndex(modded)
  const changed = modded.flatMap((r, y) => (!common.has(y) && r.plain.trim() !== '' ? [y] : []))
  const keptRows = [...new Set([...changed, ...(promptRow === null ? [] : [promptRow])])].sort(
    (x, y) => x - y,
  )
  const positionalDiffRows = modded.filter(
    (r, y) => comparable(r.ansi) !== comparable(baseline[y]?.ansi ?? ''),
  ).length
  const kept = keptRows.map((y) => modded[y] as ScreenRow)
  return {
    keptRows,
    promptRow,
    positionalDiffRows,
    segments: changed.length ? parseAnsi(kept.map((r) => r.ansi).join('\n')) : [],
    plain: kept.map((r) => r.plain),
    comparableKey: kept.map((r) => comparable(r.ansi)).join('\n'),
  }
}
