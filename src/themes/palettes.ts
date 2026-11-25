import type { PublishedTheme } from './queries'
import type { ThemeKind } from './theme'

/**
 * A named color palette people search for, such as "catppuccin claude code theme". It has a page
 * of its own, /themes/<slug>, once a published theme is filed under it.
 */
export interface Palette {
  slug: string
  name: string
  /** The names a theme of this palette goes by: the palette's own, and variants named otherwise. */
  matches: readonly string[]
}

/** A theme, or anything that carries its reviewed name. */
type Named = Pick<PublishedTheme, 'name'>

/** The palettes /themes names, in the order it names them. */
export const PALETTES: readonly Palette[] = [
  { slug: 'catppuccin', name: 'Catppuccin', matches: ['Catppuccin'] },
  // Alucard is Dracula's own light variant.
  { slug: 'dracula', name: 'Dracula', matches: ['Dracula', 'Alucard'] },
  { slug: 'tokyo-night', name: 'Tokyo Night', matches: ['Tokyo Night'] },
  { slug: 'gruvbox', name: 'Gruvbox', matches: ['Gruvbox'] },
  { slug: 'nord', name: 'Nord', matches: ['Nord'] },
  { slug: 'rose-pine', name: 'Rosé Pine', matches: ['Rosé Pine'] },
  // Atom's One Dark ships with One Light, and OneHalf is its port to terminals.
  { slug: 'one-dark', name: 'One Dark', matches: ['One Dark', 'One Light', 'OneHalf'] },
  { slug: 'solarized', name: 'Solarized', matches: ['Solarized'] },
]

/** Lower case, with accents split off and every run of other characters, accents included, a single space. */
const words = (text: string) =>
  ` ${text
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/**
 * A theme is filed under a palette when its reviewed name holds one of the palette's names as
 * whole words, ignoring case and accents: "Rose Pine Dawn" is Rosé Pine, "Nordic" is not Nord.
 */
function isInPalette(theme: Named, palette: Palette): boolean {
  const name = words(theme.name)
  return palette.matches.some((match) => name.includes(words(match)))
}

export function themesInPalette<T extends Named>(themes: T[], palette: Palette): T[] {
  return themes.filter((theme) => isInPalette(theme, palette))
}

/** The palettes with at least one of these themes, which are the ones that have a page. */
export function palettesWithThemes(themes: Named[]): Palette[] {
  return PALETTES.filter((palette) => themes.some((theme) => isInPalette(theme, palette)))
}

export function findPalette(slug: string): Palette | undefined {
  return PALETTES.find((palette) => palette.slug === slug)
}

/** Where a palette page's themes apply, in its title, heading and description. */
function wherePhrase(kinds: ReadonlySet<ThemeKind>): {
  title: string
  heading: string
  prose: string
} {
  if (!kinds.has('terminal')) {
    return { title: 'Claude Desktop', heading: 'Claude Desktop', prose: 'Claude Desktop' }
  }
  if (!kinds.has('desktop')) {
    const heading = 'the Claude Code terminal'
    return { title: 'the Claude Code Terminal', heading, prose: heading }
  }
  const both = 'Claude Code and Claude Desktop'
  return { title: both, heading: both, prose: 'the Claude Code terminal and Claude Desktop' }
}

/**
 * A palette page's title (before the site name), heading and description. Each names the palette
 * and only the places its themes apply, so a page of Desktop themes never says "terminal".
 */
export function palettePageCopy(
  palette: Palette,
  themes: PublishedTheme[],
): { title: string; heading: string; description: string } {
  const where = wherePhrase(new Set(themes.map((theme) => theme.kind)))
  const one = themes.length === 1
  const counted = `${themes.length} ${palette.name} ${one ? 'theme' : 'themes'}`
  return {
    title: `${palette.name} Themes for ${where.title}`,
    heading: `${palette.name} themes for ${where.heading}`,
    description: `${counted} for ${where.prose}, ${one ? '' : 'each '}previewed in a real session. Each plugin is reviewed and its install pinned.`,
  }
}

/**
 * The anchor a theme card's link lands on: its plugin and its key, which a re-pin keeps, unlike
 * the theme's id.
 */
export const themeAnchor = (theme: PublishedTheme) => `${theme.plugin.slug}-${theme.key}`
