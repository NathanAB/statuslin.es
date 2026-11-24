import { fixedColorWindow } from './fixed-color'

/**
 * One look a plugin carries (ADR 0012). The plugin is still the unit statuslin.es reviews, pins and
 * installs; a theme is the unit visitors browse, one card each on /themes. A terminal theme is a
 * file the plugin ships; a Desktop theme is a look a mod's code sets in Claude Desktop.
 */
export const THEME_KINDS = ['terminal', 'desktop'] as const
export type ThemeKind = (typeof THEME_KINDS)[number]
/** Where a kind of theme applies, as its card says. */
export const THEME_KIND_LABEL: Record<ThemeKind, string> = {
  terminal: 'Terminal',
  desktop: 'Claude Desktop',
}

/** The window a theme is made for, and the window its preview is drawn in. */
export const THEME_WINDOWS = ['light', 'dark'] as const
export type ThemeWindow = (typeof THEME_WINDOWS)[number]
export const THEME_WINDOW_LABEL: Record<ThemeWindow, string> = { light: 'Light', dark: 'Dark' }

export const themeCount = (count: number) => `${count} ${count === 1 ? 'theme' : 'themes'}`

/** The `base` values a terminal theme file may name (code.claude.com/docs/en/terminal-config). */
export const TERMINAL_THEME_BASES = [
  'dark',
  'light',
  'dark-daltonized',
  'light-daltonized',
  'dark-ansi',
  'light-ansi',
] as const
export type TerminalThemeBase = (typeof TERMINAL_THEME_BASES)[number]

/**
 * The bases that draw with the terminal's own palette. Claude Code 2.1.310's `/theme` labels them
 * "(ANSI colors only)" and builds them from `ansi:<name>` colors alone: the 16 colors the user's
 * terminal sets, so a theme on one looks as the user's terminal makes it, not as its preview shows.
 */
export const TERMINAL_COLOR_BASES = [
  'dark-ansi',
  'light-ansi',
] as const satisfies readonly TerminalThemeBase[]

export function usesTerminalColors(base: TerminalThemeBase): boolean {
  return TERMINAL_COLOR_BASES.some((ansi) => ansi === base)
}

/**
 * What a theme card says of a theme that draws with the terminal's own palette, since its preview
 * shows the recorder's terminal palette, not the one the theme is named for.
 */
export const TERMINAL_COLORS_NOTICE =
  "Uses your terminal's own colors. This preview shows a default terminal's colors."

/**
 * The window a terminal theme file is made for. A base other than an ANSI one names it. An ANSI base
 * names which of the terminal's slots draw text, not the window (Gruvbox Light's terminal palette
 * puts dark colors in its "white" slots, so its author picked `dark-ansi`). So an ANSI theme's
 * window is that of the color behind your messages in the transcript (`userMessageBackground`, the
 * surface nearest the window) when that is a fixed color, which renders the same in every terminal,
 * and its base's word otherwise.
 */
export function terminalThemeWindow({
  base,
  overrides,
}: {
  base: TerminalThemeBase
  overrides: Readonly<Record<string, string>>
}): ThemeWindow {
  const named: ThemeWindow = base.startsWith('light') ? 'light' : 'dark'
  if (!usesTerminalColors(base)) return named
  return fixedColorWindow(overrides.userMessageBackground) ?? named
}

/**
 * A theme's key within its plugin: a terminal theme's file slug (`themes/<key>.json`), or the key
 * the operator gives a Desktop theme, such as the id its mod's switch command takes.
 */
export const THEME_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const THEME_KEY_MAX = 64
/** The longest name a theme may show in `/theme`, on its card and in /admin. */
export const THEME_NAME_MAX = 64

/**
 * A terminal theme as read from a plugin's `themes/` folder at its pinned commit, inside the
 * inspection sandbox. `name` is the author's text: shown as plain text, never put in a prompt.
 */
export interface TerminalThemeFile {
  key: string
  name: string
  window: ThemeWindow
  /** Whether it is on an ANSI base, which draws with the user's own terminal palette. */
  usesTerminalColors: boolean
  /** The file exactly as pinned, which the operator reads in /admin before publishing. */
  source: string
}

/**
 * The `theme` setting value that selects a plugin's terminal theme. The plugin name is plugin.json's
 * (what `--plugin-dir` loads it as). Checked in Claude Code 2.1.310: `custom:<key>` alone selects
 * nothing, since that form names a theme in `~/.claude/themes/`.
 */
export function terminalThemeSetting(pluginName: string, key: string): string {
  return `custom:${pluginName}:${key}`
}

/**
 * A Desktop theme as the operator declares it for a mod: its name, the window it is made for, and
 * what to send in a new Claude Desktop session to switch to it, none when the mod sets it on its own.
 * The recorder sends exactly these steps, and the theme's card shows them. `name` is shown as text.
 */
export interface DesktopTheme {
  key: string
  name: string
  window: ThemeWindow
  switchSteps: string[]
}
