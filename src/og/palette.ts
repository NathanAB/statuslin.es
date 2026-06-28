/**
 * The brand colors the OG cards need. satori can't read the app.css CSS variables, so src/og
 * restates them here — the ONE place it does. test/og/palette.test.ts asserts each value equals
 * its app.css token, so this copy can't drift from the design system. Update app.css first, then
 * this file; the test enforces the pair.
 */
export const OG_PALETTE = {
  background: '#141413',
  foreground: '#faf9f5',
  mutedForeground: '#b0aea5',
  primary: '#c96442',
  sunken: '#0c0b0a',
} as const
