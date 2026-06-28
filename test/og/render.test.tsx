import { describe, expect, it } from 'vitest'
import { toElementPng } from '@/og/render'

// PNG files start with these 8 magic bytes.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('toElementPng', () => {
  it('renders an element to a non-trivial PNG buffer', async () => {
    const png = await toElementPng(
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          color: 'white',
          fontFamily: 'StatuslineNerd',
          fontSize: 48,
        }}
      >
        hello ↻
      </div>,
    )
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
    // A blank/empty render is a few hundred bytes; real glyphs push it well past 1KB.
    expect(png.length).toBeGreaterThan(1000)
  })
})
