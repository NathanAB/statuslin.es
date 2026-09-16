import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/styles/app.css', 'utf8')

describe('StatuslineNerd browser font URL', () => {
  it('loads the WOFF2 through a relative url() so Vite fingerprints the file', () => {
    // `/fonts/statusline-nerd.woff2` is copied as-is from public/. Chrome keeps that
    // family at the stable URL across deploys (even after a hard reload), so a newly
    // subsetted glyph never paints. A relative url() is emitted as /assets/…-[hash].woff2.
    const face = css.match(/@font-face\s*\{[^}]*font-family:\s*"StatuslineNerd"[^}]*\}/)
    expect(face).not.toBeNull()
    expect(face?.[0]).not.toMatch(/url\("\/fonts\//)
    expect(face?.[0]).toMatch(/src:\s*url\("\.\.?\/[^"]+statusline-nerd\.woff2"\)/)
  })
})
