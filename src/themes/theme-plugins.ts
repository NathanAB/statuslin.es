import type { PublishedTheme } from './queries'

/** The plugins that carry these themes, each once, in the order their first theme comes. */
export function themePlugins(themes: PublishedTheme[]): PublishedTheme['plugin'][] {
  return [...new Map(themes.map(({ plugin }) => [plugin.slug, plugin])).values()]
}
