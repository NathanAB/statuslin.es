import { describe, expect, it } from 'vitest'
import { parseAnsi } from '@/render/ansi'

describe('parseAnsi', () => {
  it('returns one plain segment for text with no codes', () => {
    const segs = parseAnsi('opus main')
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ text: 'opus main', fg: null, bold: false })
  })
  it('splits on a color code and captures the foreground', () => {
    const segs = parseAnsi('\x1b[35mOpus\x1b[0m main')
    const first = segs[0]
    expect(first?.text).toBe('Opus')
    expect(first?.fg).toBeTruthy()
    expect(segs.map((s) => s.text).join('')).toBe('Opus main')
  })
  it('captures bold', () => {
    const segs = parseAnsi('\x1b[1mX\x1b[0m')
    expect(segs[0]?.bold).toBe(true)
  })

  it('strips an OSC-8 hyperlink, keeping only the visible link text', () => {
    // ESC ]8;;URL ESC\  PR #1290  ESC ]8;; ESC\  — a terminal hyperlink (ST-terminated).
    const segs = parseAnsi('app \x1b]8;;https://example.com/pr/1\x1b\\PR #1290\x1b]8;;\x1b\\ done')
    const text = segs.map((s) => s.text).join('')
    expect(text).toBe('app PR #1290 done')
    expect(text).not.toContain(']8;')
    expect(text).not.toContain('example.com')
  })

  it('strips a BEL-terminated OSC sequence (e.g. window title)', () => {
    const segs = parseAnsi('\x1b]0;my title\x07hello')
    expect(segs.map((s) => s.text).join('')).toBe('hello')
  })

  it('keeps colors that appear inside a hyperlink', () => {
    const segs = parseAnsi('\x1b]8;;https://x/\x1b\\\x1b[32mPR\x1b[0m\x1b]8;;\x1b\\')
    expect(segs[0]?.text).toBe('PR')
    expect(segs[0]?.fg).toBeTruthy()
  })

  it('leaves a malformed (unterminated) OSC sequence and the text after it intact', () => {
    // No terminator after the URL → nothing to safely strip; real text must not be eaten.
    const segs = parseAnsi('before \x1b]8;;https://no-terminator after')
    expect(segs.map((s) => s.text).join('')).toContain('after')
  })
})
