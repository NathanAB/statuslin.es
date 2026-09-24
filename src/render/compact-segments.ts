import type { AnsiSegment } from './types'

export function compactSegments(segments: AnsiSegment[]): AnsiSegment[] {
  return segments.map(({ text, fg, bg, bold, italic, underline }) => ({
    text,
    ...(fg ? { fg } : {}),
    ...(bg ? { bg } : {}),
    ...(bold ? { bold } : {}),
    ...(italic ? { italic } : {}),
    ...(underline ? { underline } : {}),
  }))
}
