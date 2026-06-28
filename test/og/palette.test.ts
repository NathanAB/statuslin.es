import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OG_PALETTE } from '@/og/palette'
import { normalizeHex, tokenLiteralsOf } from '../../scripts/check-frontend'

// app.css is the single definition of every brand color. The OG palette restates a few of them
// (satori can't read CSS variables); this test makes that copy provably equal, so it can't drift.
describe('OG_PALETTE', () => {
  it('every value matches a token defined in app.css', () => {
    const css = readFileSync('src/styles/app.css', 'utf8')
    const tokens = tokenLiteralsOf(css) // Set of normalized hex literals defined in app.css
    for (const [key, value] of Object.entries(OG_PALETTE)) {
      expect(tokens.has(normalizeHex(value)), `${key}=${value} is not an app.css token`).toBe(true)
    }
  })
})
