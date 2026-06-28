import Anser from 'anser'
import type { AnsiSegment } from './types'

export function parseAnsi(stdout: string): AnsiSegment[] {
  const chunks = Anser.ansiToJson(stdout, { use_classes: false, remove_empty: true })
  return chunks.map((c) => ({
    text: c.content,
    fg: c.fg ? `rgb(${c.fg})` : null,
    bg: c.bg ? `rgb(${c.bg})` : null,
    bold: c.decorations?.includes('bold') ?? false,
    italic: c.decorations?.includes('italic') ?? false,
    underline: c.decorations?.includes('underline') ?? false,
  }))
}
