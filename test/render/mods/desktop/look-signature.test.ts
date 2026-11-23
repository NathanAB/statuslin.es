import { describe, expect, it } from 'vitest'
import { maskedSignatureCommand, parseSignature } from '@/render/mods/desktop/look-signature'

describe('maskedSignatureCommand', () => {
  it('hashes the first frame of a PNG with each mask painted black, at device scale', () => {
    expect(maskedSignatureCommand('/tmp/shot.png', [{ x: 1, y: 2, width: 3, height: 4 }])).toBe(
      "convert 'png:/tmp/shot.png[0]' -fill black -draw 'rectangle 2,4 7,11' -format '%#' info:",
    )
  })
})

describe('parseSignature', () => {
  it('reads a printed SHA-256', () => {
    expect(parseSignature(`${'0a'.repeat(32)}\n`)).toBe('0a'.repeat(32))
  })

  it.each([
    ['a short hash', 'abc'],
    ['anything else a hostile shot could print', `${'f'.repeat(64)} x`],
  ])('refuses %s', (_what, stdout) => {
    expect(() => parseSignature(stdout)).toThrow('unreadable shot signature')
  })
})
