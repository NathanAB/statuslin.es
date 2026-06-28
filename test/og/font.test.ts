import { describe, expect, it } from 'vitest'
import { loadOgFonts } from '@/og/font'

describe('loadOgFonts', () => {
  it('hands satori the Nerd Font plus a fallback for the glyphs it lacks (↻ ⇡ ✔)', () => {
    // satori has no system-font fallback (unlike the browser), so any glyph missing from the
    // fonts we give it renders as a tofu box. JetBrains Mono Nerd Font omits common status-line
    // symbols — ↻ (U+21BB), ⇡, ⇣, ✔, ✘ — so we add DejaVu Sans Mono as a second font; satori
    // falls back to it per-glyph. Without this entry those glyphs render as tofu in the cards.
    const fonts = loadOgFonts()
    const names = fonts.map((f) => f.name)
    expect(names).toContain('StatuslineNerd')
    expect(names).toContain('OgFallback')
    // Guard the bytes too, not just the name: a present-but-empty buffer would still register the
    // name yet draw tofu. Each font must carry real glyph data.
    for (const f of fonts) expect(f.data.byteLength).toBeGreaterThan(0)
  })
})
