import Anser from 'anser'
import type { AnsiSegment } from './types'

// OSC (Operating System Command) sequences — `ESC ] … <terminator>`, terminated by BEL (0x07) or
// ST (`ESC \`). These control the terminal (hyperlinks OSC-8, window title OSC-0/2, clipboard
// OSC-52, …) and carry no visible content, but Anser passes their raw bytes through into the text.
// A preview card is not a live terminal, so strip them, keeping any visible text BETWEEN an open
// and close (e.g. an OSC-8 link's label). Requires a real terminator, so an unterminated sequence
// is left as-is and never eats real text. Built via new RegExp() + fromCharCode so the ESC/BEL
// control chars don't trip Biome's noControlCharactersInRegex (same approach as obfuscation.ts).
const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const OSC_SEQUENCE = new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'g')

export function parseAnsi(stdout: string): AnsiSegment[] {
  const chunks = Anser.ansiToJson(stdout.replace(OSC_SEQUENCE, ''), {
    use_classes: false,
    remove_empty: true,
  })
  return chunks.map((c) => ({
    text: c.content,
    fg: c.fg ? `rgb(${c.fg})` : null,
    bg: c.bg ? `rgb(${c.bg})` : null,
    bold: c.decorations?.includes('bold') ?? false,
    italic: c.decorations?.includes('italic') ?? false,
    underline: c.decorations?.includes('underline') ?? false,
  }))
}
