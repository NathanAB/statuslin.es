import { describe, expect, it } from 'vitest'
import { checkedPng, PNG_MAX_BYTES } from '@/render/mods/desktop/png'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A PNG's signature and IHDR chunk header, which is all the check reads. */
function pngHeader(width: number, height: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extra)
  bytes.set(SIGNATURE, 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('checkedPng', () => {
  it('passes a PNG of the expected size', () => {
    const png = pngHeader(1568, 258)

    expect(checkedPng(png, { width: 1568, height: 258 })).toBe(png)
  })

  it('refuses bytes that are not a PNG', () => {
    const bytes = pngHeader(10, 10)
    bytes[1] = 0

    expect(() => checkedPng(bytes, { width: 10, height: 10 })).toThrow(/not a PNG/)
  })

  it('refuses a PNG whose first chunk is not IHDR', () => {
    const bytes = pngHeader(10, 10)
    bytes[12] = 0x58

    expect(() => checkedPng(bytes, { width: 10, height: 10 })).toThrow(/not a PNG/)
  })

  it('refuses a PNG of another size', () => {
    expect(() => checkedPng(pngHeader(1568, 259), { width: 1568, height: 258 })).toThrow(
      /1568x259, not 1568x258/,
    )
  })

  it('refuses a PNG over the byte cap', () => {
    expect(() => checkedPng(pngHeader(10, 10, PNG_MAX_BYTES), { width: 10, height: 10 })).toThrow(
      /over the/,
    )
  })
})
