import { withoutInlineCode } from '@/lib/inline-code'
import {
  keywordPageTitle,
  metaDescription,
  normalizeWhitespace,
  PAGE_TITLE_BRAND,
  PAGE_TITLE_MAX_LENGTH,
  truncateAtWordBoundary,
} from '@/lib/search-text'

/**
 * What a plugin page's title and fallback description call it. A theme plugin runs no code, so it
 * is never called a mod (GLOSSARY.md): it is titled by its themes.
 */
const PLUGIN_PAGE_WORDS = {
  mod: {
    keyword: ' — Claude Code mod',
    headlineLead: 'mod',
    fallback:
      'A reviewed Claude Code mod. See its preview and what it can touch, then install it with one copied prompt.',
  },
  themes: {
    keyword: ' — Claude Code Themes',
    headlineLead: 'themes',
    fallback:
      "Reviewed Claude Code terminal themes. See each theme's preview, then install them with one copied prompt.",
  },
} as const

const pluginPageWords = (themeOnly: boolean) => PLUGIN_PAGE_WORDS[themeOnly ? 'themes' : 'mod']

/**
 * With a reviewed headline, the title names the problem the mod solves so the page ranks for it,
 * not only for the mod's name. "mod" follows the name because people search "<name> mod"; a theme
 * plugin's name is followed by "themes" instead. The headline gives way to fit, never the name.
 */
export function modPageTitle(
  title: string,
  headline?: string,
  { themeOnly = false }: { themeOnly?: boolean } = {},
): string {
  const words = pluginPageWords(themeOnly)
  if (!headline) return keywordPageTitle(title, words.keyword)
  const lead = `${normalizeWhitespace(title)} ${words.headlineLead}: `
  const branded = `${lead}${headline}${PAGE_TITLE_BRAND}`
  if (branded.length <= PAGE_TITLE_MAX_LENGTH) return branded
  const budget = PAGE_TITLE_MAX_LENGTH - lead.length
  const firstWord = headline.split(' ', 1)[0] ?? ''
  // A headline cut inside its first word reads as noise; the plain title says more.
  if (headline.length > budget && firstWord.length + 1 > budget) {
    return keywordPageTitle(title, words.keyword)
  }
  return `${lead}${truncateAtWordBoundary(headline, budget)}`
}

/**
 * With page copy, `<Name> for Claude Code: <summary>`: the name and "Claude Code" match how mods
 * are searched, and the summary is ours, unlike the author's sentence GitHub also shows. Without
 * page copy, the author's description. Snippets show plain text, so code marks are dropped.
 */
export function modMetaDescription({
  title,
  description,
  copy,
  themeOnly = false,
}: {
  title: string
  description: string
  copy: { summary: string } | null
  themeOnly?: boolean
}): string {
  const text = copy
    ? `${normalizeWhitespace(title)} for Claude Code: ${withoutInlineCode(copy.summary)}`
    : description
  return metaDescription(text, pluginPageWords(themeOnly).fallback)
}
