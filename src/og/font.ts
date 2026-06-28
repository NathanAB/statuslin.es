// The binaryArrayBuffer Vite plugin (vite.config.ts) handles the ?arraybuffer suffix:
// it inlines the TTF as a base64-encoded Buffer at build time so the font is bundled
// into .output/server without needing the file on disk at runtime. readFileSync with
// import.meta.url would resolve relative to the built bundle, where the font is absent.
import type { Font as FontOptions } from 'satori'
import fallbackData from './fonts/dejavu-sans-mono.ttf?arraybuffer'
import fontData from './fonts/statusline-nerd-full.ttf?arraybuffer'

export type SatoriFont = Required<Pick<FontOptions, 'data' | 'weight' | 'style'>> & {
  name: string
}

let cached: SatoriFont[] | null = null

/** The fonts handed to satori, in priority order. satori has no system-font fallback, so it draws a
 * tofu box for any glyph missing from these fonts.
 *  1. The full Nerd Font: Latin, box-drawing, blocks, powerline, the whole Nerd icon range, and most
 *     arrows. But JetBrains Mono omits several common status-line symbols — ↻ (U+21BB), ⇡, ⇣, ✔, ✘.
 *  2. DejaVu Sans Mono fallback: carries exactly those omitted symbols. satori falls back to it
 *     per-glyph, so a status line using ↻ renders the arrow instead of a tofu box.
 * Emoji are handled separately via loadAdditionalAsset (twemoji). */
export function loadOgFonts(): SatoriFont[] {
  if (cached) return cached
  cached = [
    { name: 'StatuslineNerd', data: fontData, weight: 400, style: 'normal' },
    { name: 'OgFallback', data: fallbackData, weight: 400, style: 'normal' },
  ]
  return cached
}

/** The Unicode codepoint of an emoji segment as lowercase hex (e.g. '1f916' for 🤖). Uses the first
 * codepoint; good enough for the common single-codepoint emoji in status lines. */
export function emojiCodepoint(segment: string): string {
  return (segment.codePointAt(0) ?? 0).toString(16)
}

const EMOJI_FETCH_TIMEOUT_MS = 2000
// jdecked/twemoji is the maintained fork; assets are individual SVGs named by codepoint. Pinned to
// an exact release tag (not @latest) so emoji rendering is reproducible and can't drift under us.
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg'

/** satori loadAdditionalAsset: for an emoji segment, return a twemoji SVG as a data URL; otherwise
 * null (let satori fall back / skip). Bounded by a timeout and fail-soft — a CDN hiccup must never
 * hang or fail the card render. */
export async function loadEmojiAsset(code: string, segment: string): Promise<string | null> {
  if (code !== 'emoji') return null
  try {
    const res = await fetch(`${TWEMOJI_BASE}/${emojiCodepoint(segment)}.svg`, {
      signal: AbortSignal.timeout(EMOJI_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const svg = await res.text()
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  } catch {
    return null
  }
}
