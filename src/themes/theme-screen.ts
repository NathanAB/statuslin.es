import { parseAnsi } from '@/render/ansi'
import {
  blankMatch,
  EFFORT_HINT,
  maskRow,
  showsNothing,
  TURN_DURATION_MASKS,
} from '@/render/mods/crop'
import type { AnsiSegment } from '@/render/types'

/**
 * A terminal theme's preview: the whole recorded screen, rows split by newlines as a mod's crop is.
 * A theme recolors every row, Claude Code's branding included, so nothing is cropped against a
 * baseline. What differs between two recordings of one session reads the same in every run, so the
 * preview the operator reviewed is the one that goes live.
 */
export function themeScreenPreview(rows: readonly string[]): AnsiSegment[] {
  const steady = rows.map((row) => {
    const masked = blankMatch(maskRow(row, TURN_DURATION_MASKS), EFFORT_HINT)
    return showsNothing(masked) ? '' : masked
  })
  let end = steady.length
  while (end > 0 && steady[end - 1] === '') end--
  return parseAnsi(steady.slice(0, end).join('\n'))
}
