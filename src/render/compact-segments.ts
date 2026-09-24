import type { AnsiSegment } from './types'

/** Drop default-valued style fields. Previews ship to the browser twice (SSR markup + hydration
 * data), and the defaults were most of each segment's serialized bytes. Renders identically.
 * Kept apart from ansi.ts so importing it never pulls Anser into the client bundle. */
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
