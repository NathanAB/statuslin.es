/** A Desktop screenshot is a few hundred KB; past this the sandbox is sending something else. */
export const PNG_MAX_BYTES = 8 * 1024 * 1024

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = [0x49, 0x48, 0x44, 0x52]
const HEADER_BYTES = 24

const matches = (bytes: Uint8Array, at: number, expected: readonly number[]) =>
  expected.every((b, i) => bytes[at + i] === b)

/**
 * Checks hostile bytes from the sandbox before they are stored: a PNG, under the cap, and exactly
 * the size the crop asked for. The pixels themselves are left alone.
 */
export function checkedPng(
  bytes: Uint8Array,
  expected: { width: number; height: number },
): Uint8Array {
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
