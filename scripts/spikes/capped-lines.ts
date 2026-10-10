/** Total stdout a session may print, the same as the pty cap (PTY_MAX_BYTES). */
export const STDOUT_MAX_BYTES = 4 * 1024 * 1024
/** One NDJSON line; a Desktop tree is at most 262,144 characters, so this leaves room for the envelope. */
export const LINE_MAX_CHARS = 1024 * 1024

export type Line = { kind: 'json'; value: unknown } | { kind: 'dropped'; reason: string }

/**
 * Splits hostile stdout into NDJSON values. Sizes are checked before any JSON.parse: a line over
 * LINE_MAX_CHARS is dropped unparsed, and past STDOUT_MAX_BYTES nothing more is accepted.
 */
export class CappedLines {
  overflowed = false
  private bytes = 0
  private partial = ''
  private skippingLongLine = false

  push(chunk: string): Line[] {
    if (this.overflowed) return []
    this.bytes += Buffer.byteLength(chunk)
    if (this.bytes > STDOUT_MAX_BYTES) {
      this.overflowed = true
      return [{ kind: 'dropped', reason: `stdout passed ${STDOUT_MAX_BYTES} bytes` }]
    }
    const out: Line[] = []
    const pieces = chunk.split('\n')
    for (const [i, piece] of pieces.entries()) {
      const ends = i < pieces.length - 1
      if (this.skippingLongLine) {
        if (ends) this.skippingLongLine = false
        continue
      }
      this.partial += piece
      if (this.partial.length > LINE_MAX_CHARS) {
        out.push({ kind: 'dropped', reason: `line passed ${LINE_MAX_CHARS} characters` })
        this.partial = ''
        this.skippingLongLine = !ends
        continue
      }
      if (!ends) continue
      const line = this.partial.trim()
      this.partial = ''
      if (line !== '') out.push(parseLine(line))
    }
    return out
  }
}

function parseLine(line: string): Line {
  try {
    return { kind: 'json', value: JSON.parse(line) }
  } catch {
    return { kind: 'dropped', reason: `not JSON (${line.length} characters)` }
  }
}
