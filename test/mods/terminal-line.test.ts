import { describe, expect, it } from 'vitest'
import { printable, terminalLine } from '@/mods/publish'

describe('printable', () => {
  it('escapes control and format characters and the backslash', () => {
    expect(printable('a\u001b[2K‮\\b')).toBe('a\\u001b[2K\\u202e\\u005cb')
  })

  it('braces an astral escape so a following digit stays outside the code', () => {
    expect(printable('\u{e0001}5')).toBe('\\u{e0001}5')
  })
})

describe('terminalLine', () => {
  it('leaves a short line as printable() makes it', () => {
    expect(terminalLine('ok\u0007')).toBe('ok\\u0007')
  })

  it('caps a long line at 500 characters and counts what it dropped', () => {
    const line = terminalLine('x'.repeat(1000))

    expect(line.length).toBeLessThanOrEqual(500)
    expect(line).toMatch(/^x+… \(\d+ more characters\)$/)
  })

  it('never cuts an astral escape in half', () => {
    const line = terminalLine('\u{e0001}'.repeat(200))

    expect(line).toMatch(/^(\\u\{e0001\})+… \(\d+ more characters\)$/)
  })
})
