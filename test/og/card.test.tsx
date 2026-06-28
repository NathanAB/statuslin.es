import { describe, expect, it } from 'vitest'
import { configCard, homeCard } from '@/og/card'
import { toElementPng } from '@/og/render'
import type { AnsiSegment } from '@/render/types'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const seg = (text: string, fg: string | null = null): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

describe('og cards render to PNG', () => {
  it('homeCard produces a PNG', async () => {
    const png = await toElementPng(homeCard())
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
    expect(png.length).toBeGreaterThan(1000)
  })

  it('configCard renders a status line with a reset glyph and an icon', async () => {
    const previews = [
      {
        scenarioKey: 'clean-main',
        segments: [seg('main', 'rgb(187,0,187)'), seg(' ↻2h6m '), seg('')],
      },
    ]
    const png = await toElementPng(
      configCard({ title: 'Single-line usage', author: 'Ada Lovelace', previews }),
    )
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
    // ↻ (U+21BB) comes from the DejaVu fallback font (the Nerd Font omits it) and the powerline
    // glyph (U+E0A0) from the Nerd Font; a missing-glyph blank render would be much smaller.
    expect(png.length).toBeGreaterThan(2000)
  })

  it('configCard tolerates an empty previews list and a null author', async () => {
    const png = await toElementPng(configCard({ title: 'No previews', author: null, previews: [] }))
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
  })
})
