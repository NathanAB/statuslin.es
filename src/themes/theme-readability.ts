import { contrastRatio, fixedRgb, hueAndSaturation, type Rgb } from './fixed-color'
import { type TerminalThemeBase, type ThemeWindow, usesTerminalColors } from './theme'

/** The colors this check reads, as Claude Code names them in a theme file's `overrides`. */
type CheckedToken = 'text' | 'permission' | 'diffAdded' | 'diffRemoved'

/**
 * Each base's own colors for the checked tokens, which a theme keeps unless it overrides them: a
 * fixed color's channels, or one of the terminal's own 16. Read from Claude Code 2.1.310's built-in
 * palettes; recheck when a release changes them.
 */
const BASE_COLORS: Record<TerminalThemeBase, Record<CheckedToken, Rgb | string>> = {
  dark: {
    text: [255, 255, 255],
    permission: [177, 185, 249],
    diffAdded: [34, 92, 43],
    diffRemoved: [122, 41, 54],
  },
  light: {
    text: [0, 0, 0],
    permission: [87, 105, 247],
    diffAdded: [105, 219, 124],
    diffRemoved: [255, 168, 180],
  },
  'dark-daltonized': {
    text: [255, 255, 255],
    permission: [153, 204, 255],
    diffAdded: [0, 68, 102],
    diffRemoved: [102, 0, 0],
  },
  'light-daltonized': {
    text: [0, 0, 0],
    permission: [51, 102, 255],
    diffAdded: [153, 204, 255],
    diffRemoved: [255, 204, 204],
  },
  'dark-ansi': {
    text: 'ansi:whiteBright',
    permission: 'ansi:blueBright',
    diffAdded: 'ansi:green',
    diffRemoved: 'ansi:red',
  },
  'light-ansi': {
    text: 'ansi:black',
    permission: 'ansi:blue',
    diffAdded: 'ansi:green',
    diffRemoved: 'ansi:red',
  },
}

/**
 * WCAG's floor for large text and interface parts (https://www.w3.org/TR/WCAG22/#contrast-minimum,
 * #non-text-contrast). Lower than the 4.5:1 body text asks, because the check refuses a plugin: it
 * catches a prompt or diff made unreadable, not a palette that is merely soft.
 */
const MIN_CONTRAST = 3

/**
 * The terminal draws its own background, which no theme token sets. A theme is made for a dark or
 * light window, so the check takes the darkest or lightest terminal it would sit in.
 */
const SCREEN: Record<ThemeWindow, { rgb: Rgb; name: string }> = {
  dark: { rgb: [0, 0, 0], name: 'black' },
  light: { rgb: [255, 255, 255], name: 'white' },
}

const READ_ON = [
  { what: 'the permission prompt', fg: 'permission', bg: 'screen' },
  {
    what: 'text, such as the command a permission prompt asks about,',
    fg: 'text',
    bg: 'screen',
  },
  { what: 'an added line in a diff', fg: 'text', bg: 'diffAdded' },
  { what: 'a removed line in a diff', fg: 'text', bg: 'diffRemoved' },
] as const satisfies { what: string; fg: CheckedToken; bg: CheckedToken | 'screen' }[]

/** HSL hue bands, in degrees, that read as red (wrapping past 360) and as green. */
const isRed = (hue: number) => hue < 20 || hue >= 340
const isGreen = (hue: number) => hue >= 80 && hue < 170
/** Below this HSL saturation a color reads as gray, whatever its hue. */
const MIN_SATURATION = 0.25

const LOOKS_SWAPPED = [
  { token: 'diffAdded', lines: 'added', reads: 'red', other: 'removed', inBand: isRed },
  { token: 'diffRemoved', lines: 'removed', reads: 'green', other: 'added', inBand: isGreen },
] as const

/** The terminal's own 16 colors, by name and by number, as a theme file may give them. */
const TERMINAL_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const TERMINAL_COLOR = new RegExp(`^ansi:(${TERMINAL_NAMES.join('|')})(Bright)?$`)
const ANSI_NUMBER = /^ansi256\((\d{1,3})\)$/

/** Number n of the 16 as its `ansi:` name, so one table reads both spellings. */
function terminalName(value: string): string | undefined {
  if (TERMINAL_COLOR.test(value)) return value
  const n = Number(ANSI_NUMBER.exec(value)?.[1])
  if (!(n < 16)) return undefined
  return `ansi:${TERMINAL_NAMES[n % 8]}${n >= 8 ? 'Bright' : ''}`
}

/**
 * The terminal sets its own 16. A theme on a fixed-color base expects a default palette, where black
 * and white are near black and white, so it can't hide the prompt behind them. An ANSI base is made
 * for a palette of its own (a light one maps white to a dark gray), so there none is judged.
 */
const TERMINAL_EXTREMES: Record<string, Rgb> = {
  'ansi:black': [0, 0, 0],
  'ansi:white': [229, 229, 229],
  'ansi:whiteBright': [255, 255, 255],
}

/** A terminal color whose hue its name gives, whatever the palette. */
const TERMINAL_HUE: Record<string, 'red' | 'green'> = {
  'ansi:red': 'red',
  'ansi:redBright': 'red',
  'ansi:green': 'green',
  'ansi:greenBright': 'green',
}

const UNCHECKABLE =
  'is not a color statuslin.es can check; the permission prompt and diffs take #rrggbb, #rgb, rgb(r,g,b), ansi256(n) or ansi:<name>'

interface Color {
  token: CheckedToken
  value: string
  rgb: Rgb | undefined
  /** One of the terminal's own 16, by its `ansi:` name. */
  terminal: string | undefined
}

const CHECKED_TOKENS = [
  'text',
  'permission',
  'diffAdded',
  'diffRemoved',
] as const satisfies CheckedToken[]

/**
 * What would hide or mislead in a terminal theme's permission prompt and diffs: text under a 3:1
 * contrast ratio, or added and removed lines in each other's colors. A color from the terminal's own
 * 16 can't be known, so a pair with one is not judged. Each problem names its tokens and colors.
 */
export function unreadableThemeColors({
  base,
  window,
  overrides,
}: {
  base: TerminalThemeBase
  window: ThemeWindow
  overrides: Readonly<Record<string, string>>
}): string[] {
  const color = (token: CheckedToken): Color => {
    const override = overrides[token]
    if (override !== undefined) {
      const name = terminalName(override)
      const rgb =
        name === undefined
          ? fixedRgb(override)
          : usesTerminalColors(base)
            ? undefined
            : TERMINAL_EXTREMES[name]
      return { token, value: override, rgb, terminal: name }
    }
    const own = BASE_COLORS[base][token]
    if (typeof own === 'string') return { token, value: own, rgb: undefined, terminal: own }
    return { token, value: `rgb(${own.join(',')})`, rgb: own, terminal: undefined }
  }
  const screen = SCREEN[window]
  const unread = CHECKED_TOKENS.flatMap((token) => {
    const { value, rgb, terminal } = color(token)
    return rgb === undefined && terminal === undefined ? [`"${token}" ${value} ${UNCHECKABLE}`] : []
  })
  if (unread.length > 0) return unread

  const contrast = READ_ON.flatMap(({ what, fg, bg }) => {
    const front = color(fg)
    const back = bg === 'screen' ? undefined : color(bg)
    const backRgb = back === undefined ? screen.rgb : back.rgb
    if (front.rgb === undefined || backRgb === undefined) return []
    const ratio = contrastRatio(front.rgb, backRgb)
    if (ratio >= MIN_CONTRAST) return []
    const behind =
      back === undefined
        ? `the terminal's background (${screen.name}, as the theme is for a ${window} window)`
        : `"${back.token}" ${back.value}`
    return [
      `${what} is unreadable: "${front.token}" ${front.value} on ${behind} has a contrast ratio of ${ratio.toFixed(2)}:1, under ${MIN_CONTRAST}:1`,
    ]
  })

  const reads = (
    { rgb, terminal }: Color,
    band: 'red' | 'green',
    inBand: (hue: number) => boolean,
  ) => {
    if (terminal !== undefined) return TERMINAL_HUE[terminal] === band
    if (rgb === undefined) return false
    const { hue, saturation } = hueAndSaturation(rgb)
    return saturation >= MIN_SATURATION && inBand(hue)
  }
  const swapped = LOOKS_SWAPPED.flatMap(({ token, lines, reads: band, other, inBand }) => {
    const found = color(token)
    if (!reads(found, band, inBand)) return []
    const { value } = found
    return [
      `${lines} lines in a diff are ${band} ("${token}" ${value}), the color of ${other} lines, so a diff reads backwards`,
    ]
  })

  return [...contrast, ...swapped]
}
