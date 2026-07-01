/**
 * <title> templates for config pages. The template exists so every config page's
 * title states the target search phrase ("Claude Code Status Line") — titles are
 * the strongest on-page ranking signal, and the config name alone doesn't say it.
 */
export function configPageTitle(title: string): string {
  return `${title} — Claude Code Status Line | statuslin.es`
}

export const NOT_FOUND_TITLE = 'Status line not found — statuslin.es'

/** The home page's title base — shared by the <title> tag and the home JSON-LD name. */
export const HOME_TITLE_BASE = 'Claude Code Status Lines — Community Gallery'
