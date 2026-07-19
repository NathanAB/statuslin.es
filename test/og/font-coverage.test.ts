import { describe, expect, it } from 'vitest'
import { loadOgFonts } from '@/og/font'
import { anyFontCovers, fontCmapCodepoints } from './cmap'

// The exact glyphs that rendered as tofu in prod status lines against the two original fonts
// (JetBrains Mono Nerd + DejaVu Sans Mono), measured across all 25 configs. Each must be covered
// by at least one font satori is given, or the OG card draws a box instead of the character.
//   CJK (from "Kanji Rain" and "Keyblade Status bar"): kanji + the corner-bracket punctuation.
//   Symbols (from Activity Feed / Usage Dot Bars / Color-Coded Context …): alt-key and reset arrow.
// NOTE: the clock emoji ⏰⏱⏳ (U+23F0/1/3) are intentionally NOT here — satori's emoji-regex routes
// them through the Twemoji loadAdditionalAsset callback, so they never fall back to these fonts.
// U+E7D5 (a Powerline PUA icon in "Powerline Dracula") is also excluded: the Unicode private-use
// area has no standard glyphs, so no general-coverage font fixes it — it needs a fuller Nerd build.
const GAP_CODEPOINTS: Record<string, number> = {
  '庫 U+5EAB': 0x5eab,
  '文 U+6587': 0x6587,
  '時 U+6642': 0x6642,
  '枝 U+679D': 0x679d,
  '樹 U+6a39': 0x6a39,
  '脳 U+8133': 0x8133,
  '週 U+9031': 0x9031,
  '「 U+300C': 0x300c,
  '」 U+300D': 0x300d,
  '⎇ U+2387': 0x2387,
  '⟳ U+27F3': 0x27f3,
}

describe('OG font coverage', () => {
  const fontSets = loadOgFonts().map((f) => fontCmapCodepoints(f.data))

  it('parses cmaps correctly: the registered fonts cover glyphs already known present', () => {
    // Positive controls — prove the parser detects presence, so a gap failure below is a real
    // absence and not a parser bug. 'A' (Nerd Font) and ↻ U+21BB (the DejaVu fallback) both render
    // today, so both must be reported as covered.
    expect(anyFontCovers(fontSets, 0x41)).toBe(true) // 'A'
    expect(anyFontCovers(fontSets, 0x21bb)).toBe(true) // ↻
  })

  for (const [label, cp] of Object.entries(GAP_CODEPOINTS)) {
    it(`covers ${label} in at least one registered font`, () => {
      expect(anyFontCovers(fontSets, cp)).toBe(true)
    })
  }
})
