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
})
