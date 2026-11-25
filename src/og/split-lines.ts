import type { AnsiSegment } from '@/render/types'

/** Split a segment list into visual lines on `\n` boundaries. A segment's text may contain newlines
 * anywhere (start, middle, end) — including `"\n\n"` for a deliberate blank line — because Anser
 * preserves them in the segment text. satori does NOT turn a `\n` inside a flex row into a line
 * break, so a multi-line status line would otherwise flatten onto one row and overflow the card.
 * Each `\n` ends the current line and starts the next; per-segment color/bold is preserved on both
 * sides of a split. Leading/trailing blank lines (the stray newlines terminals wrap output in) are
 * dropped so they don't open a gap at the top/bottom of the card; interior blank lines are kept as
 * intentional spacers. */
export function splitSegmentsIntoLines(segments: AnsiSegment[]): AnsiSegment[][] {
  const lines: AnsiSegment[][] = [[]]
  for (const s of segments) {
    const parts = s.text.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) lines.push([])
      const current = lines[lines.length - 1]
      if (current && part !== '') current.push({ ...s, text: part })
    })
  }
  while (lines.length > 0 && lines[0]?.length === 0) lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.length === 0) lines.pop()
  return lines
}
