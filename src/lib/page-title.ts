const CONFIG_PAGE_TITLE_SUFFIX = ' — Claude Code Status Line | statuslin.es'
const CONFIG_PAGE_TITLE_MAX_LENGTH = 60
const CONFIG_META_DESCRIPTION_MAX_LENGTH = 160

export const CONFIG_META_DESCRIPTION_FALLBACK =
  'A reviewed Claude Code status line — rendered preview, source, and one-paste install.'

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value

  const contentLength = maxLength - 1
  const boundary = value.slice(0, contentLength).lastIndexOf(' ')
  const end = boundary > 0 ? boundary : contentLength
  return `${value.slice(0, end).trimEnd()}…`
}

/**
 * <title> templates for config pages. The template exists so every config page's
 * title states the target search phrase ("Claude Code Status Line") — titles are
 * the strongest on-page ranking signal, and the config name alone doesn't say it.
 */
export function configPageTitle(title: string): string {
  const normalizedTitle = normalizeWhitespace(title)
  const titleBudget = CONFIG_PAGE_TITLE_MAX_LENGTH - CONFIG_PAGE_TITLE_SUFFIX.length
  return `${truncateAtWordBoundary(normalizedTitle, titleBudget)}${CONFIG_PAGE_TITLE_SUFFIX}`
}

/** Keep config search snippets concise without changing the description shown on the page. */
export function configMetaDescription(description: string | null | undefined): string {
  const normalizedDescription = normalizeWhitespace(description ?? '')
  return truncateAtWordBoundary(
    normalizedDescription || CONFIG_META_DESCRIPTION_FALLBACK,
    CONFIG_META_DESCRIPTION_MAX_LENGTH,
  )
}

export const NOT_FOUND_TITLE = 'Status line not found — statuslin.es'

/**
 * The home page's title base — shared by the <title> tag and the home JSON-LD name. These are
 * community-submitted configs, not samples, so the title says "status lines" rather than
 * "examples" or "templates".
 */
export const HOME_TITLE_BASE = 'Claude Code Status Lines'
export const HOME_HEADING_BASE = 'Claude Code status lines'
export const HOME_DESCRIPTION_BASE =
  'Browse a community gallery of Claude Code status lines. See real rendered previews and copy one in a single paste.'

function homePageSuffix(page: number): string {
  return page > 1 ? ` — Page ${page}` : ''
}

export function homePageName(page: number): string {
  return `${HOME_TITLE_BASE}${homePageSuffix(page)}`
}

export function homePageTitle(page: number): string {
  return `${homePageName(page)} | statuslin.es`
}

export function homePageHeading(page: number): string {
  return `${HOME_HEADING_BASE}${homePageSuffix(page)}`
}

export function homeMetaDescription(page: number, pageCount: number): string {
  return `${HOME_DESCRIPTION_BASE}${page > 1 ? ` Page ${page} of ${pageCount}.` : ''}`
}

/** /guide title base — shared by the <title> tag and the guide JSON-LD headline. */
export const GUIDE_TITLE_BASE = 'How to Set Up a Claude Code Status Line'

/** /guide meta description — shared by the description tag, OG, and TechArticle JSON-LD. */
export const GUIDE_DESCRIPTION =
  'How to set up a Claude Code status line: the statusLine setting, the JSON your script gets, and a tested example you can copy.'

/** /resources title base — shared by the <title> tag and the resources JSON-LD name. */
export const RESOURCES_TITLE_BASE = 'Claude Code Status Line Tools & Resources'
