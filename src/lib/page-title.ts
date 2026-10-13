import { RESOURCE_SECTIONS, type ResourceSection } from '@/resources/data'

const CONFIG_PAGE_TITLE_KEYWORD = ' — Claude Code Status Line'
const MOD_PAGE_TITLE_KEYWORD = ' — Claude Code mod'
const PAGE_TITLE_BRAND = ' | statuslin.es'
const PAGE_TITLE_MAX_LENGTH = 60
const META_DESCRIPTION_MAX_LENGTH = 160

export const CONFIG_META_DESCRIPTION_FALLBACK =
  'A reviewed Claude Code status line — rendered preview, source, and one-paste install.'
const MOD_META_DESCRIPTION_FALLBACK =
  'A Claude Code mod — rendered preview, what it touches, and a one-line install.'

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

/** `<name><keyword> | statuslin.es`, dropping the brand and then truncating the name to fit. */
function keywordPageTitle(name: string, keyword: string): string {
  const normalizedName = normalizeWhitespace(name)
  const branded = `${normalizedName}${keyword}${PAGE_TITLE_BRAND}`
  if (branded.length <= PAGE_TITLE_MAX_LENGTH) return branded

  const nameBudget = PAGE_TITLE_MAX_LENGTH - keyword.length
  return `${truncateAtWordBoundary(normalizedName, nameBudget)}${keyword}`
}

function metaDescription(description: string | null | undefined, fallback: string): string {
  const normalizedDescription = normalizeWhitespace(description ?? '')
  return truncateAtWordBoundary(normalizedDescription || fallback, META_DESCRIPTION_MAX_LENGTH)
}

/**
 * <title> templates for config pages. The template exists so every config page's
 * title states the target search phrase ("Claude Code Status Line") — titles are
 * the strongest on-page ranking signal, and the config name alone doesn't say it.
 */
export function configPageTitle(title: string): string {
  return keywordPageTitle(title, CONFIG_PAGE_TITLE_KEYWORD)
}

/** Keep config search snippets concise without changing the description shown on the page. */
export function configMetaDescription(description: string | null | undefined): string {
  return metaDescription(description, CONFIG_META_DESCRIPTION_FALLBACK)
}

export function modPageTitle(title: string): string {
  return keywordPageTitle(title, MOD_PAGE_TITLE_KEYWORD)
}

export function modMetaDescription(description: string | null | undefined): string {
  return metaDescription(description, MOD_META_DESCRIPTION_FALLBACK)
}

export const MOD_NOT_FOUND_TITLE = 'Mod not found — statuslin.es'

export const NOT_FOUND_TITLE = 'Status line not found — statuslin.es'

/**
 * The home page's title base — shared by the <title> tag and the home JSON-LD name. These are
 * community-submitted configs, not samples, so the title says "status lines" rather than
 * "examples" or "templates".
 */
export const HOME_TITLE_BASE = 'Claude Code Status Lines'
export const HOME_HEADING = 'Claude Code status lines and mods'
export const HOME_DESCRIPTION_BASE =
  'Browse a gallery of Claude Code status lines and mods with real previews. Copy a status line in one paste or install a mod with one command.'

function homePageSuffix(page: number): string {
  return page > 1 ? ` — Page ${page}` : ''
}

export function homePageName(page: number): string {
  return `${HOME_TITLE_BASE}${homePageSuffix(page)}`
}

export function homePageTitle(page: number): string {
  return `${homePageName(page)} | statuslin.es`
}

export function homeMetaDescription(page: number, pageCount: number): string {
  return `${HOME_DESCRIPTION_BASE}${page > 1 ? ` Page ${page} of ${pageCount}.` : ''}`
}

export const GUIDE_PATH = '/guide'

/** /guide title base — shared by the <title> tag and the guide JSON-LD headline. */
export const GUIDE_TITLE_BASE = 'How to Set Up a Claude Code Status Line'

export const GUIDE_DATES = { published: '2026-08-14', modified: '2026-09-23' } as const

/** /guide meta description — shared by the description tag, OG, and TechArticle JSON-LD. */
export const GUIDE_DESCRIPTION =
  'How to set up a Claude Code status line: the statusLine setting, the JSON your script gets, and a tested example you can copy.'

export const DESKTOP_GUIDE_PATH = '/guide/claude-desktop'

/** /guide/claude-desktop title base — shared by the <title> tag and its JSON-LD headline. */
export const DESKTOP_GUIDE_TITLE_BASE = 'Claude Code Status Line Not Showing in Claude Desktop'

export const DESKTOP_GUIDE_DATES = { published: '2026-10-02', modified: '2026-10-13' } as const

/** /guide/claude-desktop meta description — shared by the description tag, OG, and JSON-LD. */
export const DESKTOP_GUIDE_DESCRIPTION =
  "Claude Desktop's Code tab doesn't run your statusLine command. Add your status line back in two steps with statusline-anywhere."

export const STATUS_LINES_VS_MODS_GUIDE_PATH = '/guide/status-lines-vs-mods'

/**
 * /guide/status-lines-vs-mods title — the <title> tag and its JSON-LD headline. It leaves out
 * ` | statuslin.es`, which would push it past 60 characters.
 */
export const STATUS_LINES_VS_MODS_GUIDE_TITLE = 'Claude Code Status Lines vs Mods: Which to Use'

export const STATUS_LINES_VS_MODS_GUIDE_DATES = {
  published: '2026-10-13',
  modified: '2026-10-13',
} as const

/** /guide/status-lines-vs-mods meta description — shared by the description tag, OG, and JSON-LD. */
export const STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION =
  'A status line is a script whose output Claude Code prints in the terminal. A mod is a plugin that also draws in Claude Desktop. Here is when to use each.'

export const MOD_SAFETY_GUIDE_PATH = '/guide/are-claude-code-mods-safe'

/**
 * /guide/are-claude-code-mods-safe title — the <title> tag and its JSON-LD headline. It leaves
 * out ` | statuslin.es`, which would push it past 60 characters.
 */
export const MOD_SAFETY_GUIDE_TITLE = 'Are Claude Code Mods Safe? What a Mod Can Touch'

export const MOD_SAFETY_GUIDE_DATES = { published: '2026-10-13', modified: '2026-10-13' } as const

/** /guide/are-claude-code-mods-safe meta description — the description tag, OG, and JSON-LD. */
export const MOD_SAFETY_GUIDE_DESCRIPTION =
  'A Claude Code mod runs with your permissions. What claude plugin validate reports, how statuslin.es pins and reviews each mod, and what to check yourself.'

/** The live /guide subpages and their last edits. Every other /guide/* path redirects to /guide. */
export const GUIDE_SUBPAGES: ReadonlyArray<{ path: string; modified: string }> = [
  { path: DESKTOP_GUIDE_PATH, modified: DESKTOP_GUIDE_DATES.modified },
  { path: STATUS_LINES_VS_MODS_GUIDE_PATH, modified: STATUS_LINES_VS_MODS_GUIDE_DATES.modified },
  { path: MOD_SAFETY_GUIDE_PATH, modified: MOD_SAFETY_GUIDE_DATES.modified },
]

export function resourcesTitle(sections: ResourceSection[]): string {
  const tools = sections.find((s) => s.key === 'tools')?.resources ?? []
  const lead = tools.slice(0, 2).map((t) => t.name)
  return `${lead.join(', ')} & More Claude Code Tools`
}

export const RESOURCES_TITLE_BASE = resourcesTitle(RESOURCE_SECTIONS)
