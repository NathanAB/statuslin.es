// The binaryArrayBuffer Vite plugin (vite.config.ts) handles the ?arraybuffer suffix:
// it inlines the TTF as a base64-encoded Buffer at build time so the font is bundled
// into .output/server without needing the file on disk at runtime. readFileSync with
// import.meta.url would resolve relative to the built bundle, where the font is absent.
import type { Font as FontOptions } from 'satori'
import fallbackData from './fonts/dejavu-sans-mono.ttf?arraybuffer'
import cjkData from './fonts/noto-sans-mono-cjk-jp.otf?arraybuffer'
import legacySymbolsData from './fonts/statusline-legacy-symbols.ttf?arraybuffer'
import fontData from './fonts/statusline-nerd-full.ttf?arraybuffer'
import unifontData from './fonts/unifont.otf?arraybuffer'

export type SatoriFont = Required<Pick<FontOptions, 'data' | 'weight' | 'style'>> & {
  name: string
}

let cached: SatoriFont[] | null = null

/** The fonts handed to satori, in priority order. satori has no system-font fallback, so it draws a
 * tofu box for any glyph missing from every font here — and it falls back per-glyph down this list.
 *  1. The full Nerd Font: Latin, box-drawing, blocks, powerline, the whole Nerd icon range, and most
 *     arrows. But JetBrains Mono omits several common status-line symbols — ↻ (U+21BB), ⇡, ⇣, ✔, ✘.
 *  2. StatuslineLegacySymbols: a pinned, renamed JuliaMono subset containing U+1FB95 CHECKER BOARD
 *     FILL. Its 0.6em advance exactly matches the Nerd Font's terminal cell.
 *  3. DejaVu Sans Mono: carries exactly those omitted symbols, so a status line using ↻ renders the
 *     arrow instead of a box.
 *  4. Noto Sans Mono CJK JP: the Japanese slice of Noto's pan-CJK family (kanji, kana, and CJK
 *     punctuation like 「」). Sits above Unifont so CJK renders as proper outlines, not pixel blocks.
 *  5. GNU Unifont: covers the entire Basic Multilingual Plane by design, so it catches every remaining
 *     symbol (⎇ U+2387, ⟳ U+27F3, …) and any CJK char the JP slice lacks. It's the never-tofu backstop
 *     — a future submission with a rare BMP glyph degrades to blocky-but-readable instead of a box.
 * (The private-use area — e.g. U+E7D5 Powerline icons — has no standard glyphs, so nothing here
 * covers it; that needs a fuller Nerd build.) Emoji are handled separately via loadAdditionalAsset
 * (twemoji), which is why the clock emoji ⏰⏱⏳ never reach these fonts. */
export function loadOgFonts(): SatoriFont[] {
  if (cached) return cached
  cached = [
    { name: 'StatuslineNerd', data: fontData, weight: 400, style: 'normal' },
    {
      name: 'StatuslineLegacySymbols',
      data: legacySymbolsData,
      weight: 400,
      style: 'normal',
    },
    { name: 'OgFallback', data: fallbackData, weight: 400, style: 'normal' },
    { name: 'NotoSansMonoCJKjp', data: cjkData, weight: 400, style: 'normal' },
    { name: 'Unifont', data: unifontData, weight: 400, style: 'normal' },
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

/** A preview holds hundreds of cells, so an emoji-packed one could otherwise fetch hundreds of SVGs
 * per uncached card on a public GET. Past the cap the loader returns null, satori's skip value, as
 * it does for a failed fetch. */
export const MAX_EMOJI_FETCHES_PER_RENDER = 16
const MAX_CACHED_EMOJI = 512

/** Codepoint to data URL (null for a codepoint twemoji lacks), shared by every render. */
const emojiCache = new Map<string, Promise<string | null>>()

/** Null when twemoji has no SVG for the codepoint; throws on anything worth retrying. */
async function fetchTwemoji(codepoint: string): Promise<string | null> {
  const res = await fetch(`${TWEMOJI_BASE}/${codepoint}.svg`, {
    signal: AbortSignal.timeout(EMOJI_FETCH_TIMEOUT_MS),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`twemoji ${res.status} for ${codepoint}`)
  const svg = await res.text()
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/** satori loadAdditionalAsset for one render: for an emoji segment, a twemoji SVG as a data URL;
 * otherwise null (satori falls back to the fonts). Bounded by a timeout and fail-soft, so a CDN
 * hiccup never hangs or fails the card, and a failed fetch is retried by a later render. */
export function createEmojiLoader(): (code: string, segment: string) => Promise<string | null> {
  let fetches = 0
  return (code, segment) => {
    if (code !== 'emoji') return Promise.resolve(null)
    const codepoint = emojiCodepoint(segment)
    const cached = emojiCache.get(codepoint)
    if (cached) return cached
    if (fetches >= MAX_EMOJI_FETCHES_PER_RENDER) return Promise.resolve(null)
    fetches++
    if (emojiCache.size >= MAX_CACHED_EMOJI) {
      const firstInserted = emojiCache.keys().next().value
      if (firstInserted !== undefined) emojiCache.delete(firstInserted)
    }
    const pending = fetchTwemoji(codepoint).catch(() => {
      emojiCache.delete(codepoint)
      return null
    })
    emojiCache.set(codepoint, pending)
    return pending
  }
}
