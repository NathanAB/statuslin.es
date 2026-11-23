import type { PublishedTheme } from './queries'
import { THEME_KINDS, THEME_WINDOWS, type ThemeKind, type ThemeWindow } from './theme'

/**
 * What /themes shows, from its URL search (`?window=dark&where=terminal`): the themes made for one
 * window, that apply in one place, or every theme when a key is undefined.
 */
export interface ThemeFilter {
  where?: ThemeKind | undefined
  window?: ThemeWindow | undefined
}

const known = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.find((candidate) => candidate === value)

/**
 * /themes' search. A value it doesn't know comes back as an explicit undefined: the router spreads
 * this over the raw URL search, so a missing key would keep the junk, and the server redirects to
 * the URL without it.
 */
export function coerceThemeFilter(search: Record<string, unknown>): ThemeFilter {
  return { where: known(THEME_KINDS, search.where), window: known(THEME_WINDOWS, search.window) }
}

export function filterThemes(themes: PublishedTheme[], filter: ThemeFilter): PublishedTheme[] {
  return themes.filter(
    (theme) =>
      (filter.where === undefined || theme.kind === filter.where) &&
      (filter.window === undefined || theme.window === filter.window),
  )
}

/** The values a control offers, in their list's order; null for fewer than two, which filter nothing. */
function choices<T extends string>(values: readonly T[], present: T[]): T[] | null {
  const offered = values.filter((value) => present.includes(value))
  return offered.length > 1 ? offered : null
}

/**
 * The filters /themes offers for the themes it loaded: a window control once both windows are
 * listed, and a where control once themes apply in more than one place (when Desktop themes are).
 */
export function themeFilterOptions(themes: PublishedTheme[]): {
  where: ThemeKind[] | null
  window: ThemeWindow[] | null
} {
  return {
    where: choices(
      THEME_KINDS,
      themes.map((theme) => theme.kind),
    ),
    window: choices(
      THEME_WINDOWS,
      themes.map((theme) => theme.window),
    ),
  }
}
