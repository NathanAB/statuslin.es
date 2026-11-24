import { parseAnsi } from '@/render/ansi'
import {
  blankMatch,
  EFFORT_HINT,
  maskRow,
  showsNothing,
  TURN_DURATION_MASKS,
} from '@/render/mods/crop'
import type { AnsiSegment } from '@/render/types'

// Built with fromCharCode so the ESC doesn't trip Biome's noControlCharactersInRegex (as ansi.ts).
const SGR = `${String.fromCharCode(0x1b)}\\[[0-9;]*m`
/**
 * The bullet of the command waiting on its permission prompt blinks, so one frame catches it lit and
 * the next dark. It is stored dark.
 */
const WAITING_COMMAND_BULLET = new RegExp(`^(?:${SGR})*[● ](?:${SGR})*(?= Running )`, 'u')

/**
 * A terminal theme's preview: the whole recorded screen, rows split by newlines as a mod's crop is.
 * A theme recolors every row, Claude Code's branding included, so nothing is cropped against a
 * baseline. What differs between two recordings of one session reads the same in every run, so the
 * preview the operator reviewed is the one that goes live.
 */
export function themeScreenPreview(rows: readonly string[]): AnsiSegment[] {
  const steady = rows.map((row) => {
    const masked = blankMatch(maskRow(row, TURN_DURATION_MASKS), EFFORT_HINT).replace(
      WAITING_COMMAND_BULLET,
      ' ',
    )
    return showsNothing(masked) ? '' : masked
  })
  let start = 0
  while (start < steady.length && steady[start] === '') start++
  let end = steady.length
  while (end > start && steady[end - 1] === '') end--
  return parseAnsi(steady.slice(start, end).join('\n'))
}
