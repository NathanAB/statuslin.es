import type { ThemeWindow } from './theme'

type Rgb = readonly [number, number, number]

const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/
const ANSI256 = /^ansi256\((\d{1,3})\)$/

/** The six levels of each channel in the xterm 256-color cube (colors 16 to 231). */
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const

function ansi256Rgb(n: number): Rgb | undefined {
  // 0 to 15 are the terminal's own palette, which the user sets.
  if (n < 16 || n > 255) return undefined
  if (n >= 232) {
    const gray = 8 + 10 * (n - 232)
    return [gray, gray, gray]
  }
  const index = n - 16
  const level = (step: number) => CUBE_LEVELS[step] ?? 0
  return [level(Math.floor(index / 36)), level(Math.floor(index / 6) % 6), level(index % 6)]
}

function channels(match: RegExpExecArray, read: (text: string) => number): Rgb {
  const at = (i: number) => read(match[i] ?? '')
  return [at(1), at(2), at(3)]
}

function fixedRgb(value: string): Rgb | undefined {
  const hex6 = HEX6.exec(value)
  if (hex6) return channels(hex6, (c) => Number.parseInt(c, 16))
  const hex3 = HEX3.exec(value)
  if (hex3) return channels(hex3, (c) => Number.parseInt(`${c}${c}`, 16))
  const rgb = RGB.exec(value)
  if (rgb) {
    const color = channels(rgb, Number)
    return color.every((c) => c <= 255) ? color : undefined
  }
  const ansi = ANSI256.exec(value)
  if (ansi) return ansi256Rgb(Number(ansi[1]))
  return undefined
}

const linear = (channel: number) => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, where black and white text contrast equally. */
const EVEN_CONTRAST_LUMINANCE = 0.179

/**
 * Fixed colors render the same in every terminal: code.claude.com/docs/en/terminal-config lists
 * `#rrggbb`, `#rgb`, `rgb(r,g,b)` and `ansi256(n)`.
 */
export function fixedColorWindow(value: string | undefined): ThemeWindow | undefined {
  const rgb = value === undefined ? undefined : fixedRgb(value)
  if (rgb === undefined) return undefined
  const [r, g, b] = rgb
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  return luminance > EVEN_CONTRAST_LUMINANCE ? 'light' : 'dark'
}
