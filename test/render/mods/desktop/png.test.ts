import { describe, expect, it } from 'vitest'
import { checkedPixelPng, checkedPng, PNG_MAX_BYTES } from '@/render/mods/desktop/png'

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

/** A PNG made of whole chunks: length, type, data and a (not checked) CRC each. */
function pngOf(width: number, height: number, types: string[], trailing = 0): Uint8Array {
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, width)
  new DataView(ihdr.buffer).setUint32(4, height)
  const chunks = types.map((type) => {
    const data = type === 'IHDR' ? ihdr : new Uint8Array(type === 'IEND' ? 0 : 5)
    const chunk = new Uint8Array(12 + data.length)
    new DataView(chunk.buffer).setUint32(0, data.length)
    chunk.set(new TextEncoder().encode(type), 4)
    chunk.set(data, 8)
    return chunk
  })
  return new Uint8Array(
    Buffer.concat([Buffer.from(SIGNATURE), ...chunks, Buffer.alloc(trailing, 0x41)]),
  )
}

const SIZE = { width: 20, height: 10 }

describe('checkedPixelPng', () => {
  it('passes a PNG of nothing but pixels', () => {
    const png = pngOf(20, 10, ['IHDR', 'IDAT', 'IDAT', 'IEND'])

    expect(checkedPixelPng(png, SIZE)).toBe(png)
  })

  it('passes a palette and its transparency, which are pixels too', () => {
    expect(() =>
      checkedPixelPng(pngOf(20, 10, ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']), SIZE),
    ).not.toThrow()
  })

  it.each([
    ['a text chunk', ['IHDR', 'tEXt', 'IDAT', 'IEND']],
    ['an APNG animation', ['IHDR', 'acTL', 'fcTL', 'IDAT', 'fdAT', 'IEND']],
    ['an unknown chunk', ['IHDR', 'IDAT', 'zzZz', 'IEND']],
    ['no IEND', ['IHDR', 'IDAT']],
  ])('refuses %s', (_name, types) => {
    expect(() => checkedPixelPng(pngOf(20, 10, types), SIZE)).toThrow(/pixels/)
  })

  it('refuses bytes after IEND', () => {
    expect(() => checkedPixelPng(pngOf(20, 10, ['IHDR', 'IDAT', 'IEND'], 4), SIZE)).toThrow(
      /after IEND/,
    )
  })

  it('refuses a chunk that runs past the end', () => {
    const png = pngOf(20, 10, ['IHDR', 'IDAT', 'IEND'])
    new DataView(png.buffer).setUint32(33, 1_000_000)

    expect(() => checkedPixelPng(png, SIZE)).toThrow(/pixels/)
  })

  it('still checks the size', () => {
    expect(() => checkedPixelPng(pngOf(21, 10, ['IHDR', 'IDAT', 'IEND']), SIZE)).toThrow(/21x10/)
  })
})
