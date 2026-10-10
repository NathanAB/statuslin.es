/** A Desktop screenshot is a few hundred KB; past this the sandbox is sending something else. */
export const PNG_MAX_BYTES = 8 * 1024 * 1024

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = [0x49, 0x48, 0x44, 0x52]
const HEADER_BYTES = 24
/** A chunk's length and type before its data, and its CRC after. */
const CHUNK_OVERHEAD = 12
/** What a re-encoded crop is made of: the header, pixel data, and a palette if it has one. */
const PIXEL_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])

interface PngSize {
  width: number
  height: number
}

const matches = (bytes: Uint8Array, at: number, expected: readonly number[]) =>
  expected.every((b, i) => bytes[at + i] === b)

/**
 * Checks hostile bytes from a sandbox: a PNG, under the cap, and exactly the expected size. It
 * reads only the header; the stored crops also go through checkedPixelPng.
 */
export function checkedPng(bytes: Uint8Array, expected: PngSize): Uint8Array {
  if (bytes.byteLength > PNG_MAX_BYTES) {
    throw new Error(`PNG is ${bytes.byteLength} bytes, over the ${PNG_MAX_BYTES}-byte cap`)
  }
  if (
    bytes.byteLength < HEADER_BYTES ||
    !matches(bytes, 0, SIGNATURE) ||
    !matches(bytes, 12, IHDR)
  ) {
    throw new Error('not a PNG (bad signature or header)')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`PNG is ${width}x${height}, not ${expected.width}x${expected.height}`)
  }
  return bytes
}

/**
 * A crop as it is stored and served from our domain: pixel chunks only, ending at IEND. Text,
 * metadata, APNG frames and bytes past IEND are all refused.
 */
export function checkedPixelPng(bytes: Uint8Array, expected: PngSize): Uint8Array {
  checkedPng(bytes, expected)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = SIGNATURE.length
  while (at + CHUNK_OVERHEAD <= bytes.byteLength) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const end = at + CHUNK_OVERHEAD + length
    if (!PIXEL_CHUNKS.has(type) || end > bytes.byteLength) {
      throw new Error('the PNG has more than pixels in it')
    }
    if (type === 'IEND') {
      if (end !== bytes.byteLength) throw new Error('the PNG has bytes after IEND')
      return bytes
    }
    at = end
  }
  throw new Error('the PNG has more than pixels in it (no IEND)')
}
