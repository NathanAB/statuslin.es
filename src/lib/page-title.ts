import { SITE_NAME } from '@/lib/site'
import { RESOURCE_SECTIONS, type ResourceSection } from '@/resources/data'

const CONFIG_PAGE_TITLE_KEYWORD = ' — Claude Code Status Line'
const MOD_PAGE_TITLE_KEYWORD = ' — Claude Code mod'
export const PAGE_TITLE_BRAND = ` | ${SITE_NAME}`
const PAGE_TITLE_MAX_LENGTH = 60
const META_DESCRIPTION_MAX_LENGTH = 160

export const CONFIG_META_DESCRIPTION_FALLBACK =
  'A reviewed Claude Code status line. See its preview and source, then copy it in one paste.'
const MOD_META_DESCRIPTION_FALLBACK =
  'A reviewed Claude Code mod. See its preview and what it can touch, then install it with one copied prompt.'

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

/** `<name> | statuslin.es` under the same 60-character guard as status line and mod titles. */
export function brandedPageTitle(name: string): string {
  return keywordPageTitle(name, '')
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

export const MOD_NOT_FOUND_TITLE = `Mod not found — ${SITE_NAME}`

/** The title of any missing page: a status line, a feature page, or a comparison. */
export const NOT_FOUND_TITLE = `Page not found — ${SITE_NAME}`

/**
 * The home page's title base — shared by the <title> tag, og:title and the home JSON-LD name. It
 * names both kinds: in Search Console (2026-07-23 to 2026-10-21) 12% of home's visible queries
 * searched for status lines and none for mods, and no page on the site drew a visible "claude code
 * mods" search, so a mods-only title gave up the searches home does get.
 */
export const HOME_TITLE_BASE = 'Claude Code Mods & Status Lines'
/** The site's short name on screen: the h1 past page 1, the footer tagline and the share card. */
export const HOME_HEADING = 'Claude Code mods'
/**
 * The hero's h1. Google can build a result's title from the h1, and readers scan its first two
 * words, so it opens on the product and names mods: "customize claude code" and "claude code mods"
 * are both searched (Google autocomplete, 2026-10-21).
 */
export const HOME_HERO_HEADING = 'Customize Claude Code with mods'

/** /submit's heading over the status line or mod choice, so it never reads as a choice already made. */
export const SUBMIT_HEADING = 'Submit a status line or mod'
/** Home's meta description names both kinds, as its title does. */
export const HOME_DESCRIPTION_BASE =
  'Claude Code mods and status lines with real previews. Install any of them with one copied prompt.'

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

/**
 * /status-lines/best title base, before the month of its newest copy: the <title> tag, og:title
 * and its JSON-LD name. People search for status line "examples". A dated title leaves out
 * ` | statuslin.es`, which would push it past 60 characters.
 */
export const BEST_PAGE_TITLE_BASE = 'Best Claude Code Status Line Examples'

export const GUIDE_PATH = '/guide'
/**
 * What the header and footer call the guide: it's for writing a status line, not a mod, so the
 * label says so. Google also reads the anchor text of links to a page.
 */
export const GUIDE_LINK_LABEL = 'Write a status line'

/** /guide title base — shared by the <title> tag and the guide JSON-LD headline. */
export const GUIDE_TITLE_BASE = 'How to Set Up a Claude Code Status Line'

/** `modified` is the day a change to the page's text went live; bump it with every such change. */
export const GUIDE_DATES = { published: '2026-08-14', modified: '2026-10-23' } as const

/** /guide meta description — shared by the description tag, OG, and TechArticle JSON-LD. */
export const GUIDE_DESCRIPTION =
  'How to set up a Claude Code status line: the statusLine setting, the JSON your script gets, and a tested example you can copy.'

export const DESKTOP_GUIDE_PATH = '/guide/claude-desktop'

/** /guide/claude-desktop title base — shared by the <title> tag and its JSON-LD headline. */
export const DESKTOP_GUIDE_TITLE_BASE = 'Claude Code Status Line Not Showing in Claude Desktop'

export const DESKTOP_GUIDE_DATES = { published: '2026-10-02', modified: '2026-10-21' } as const

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
  modified: '2026-10-21',
} as const

/** /guide/status-lines-vs-mods meta description — shared by the description tag, OG, and JSON-LD. */
export const STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION =
  'A status line is a script whose output Claude Code shows under the prompt. A mod is a plugin that can draw in the terminal and in Claude Desktop.'

export const MOD_SAFETY_GUIDE_PATH = '/guide/are-claude-code-mods-safe'

/**
 * /guide/are-claude-code-mods-safe title — the <title> tag and its JSON-LD headline. It leaves
 * out ` | statuslin.es`, which would push it past 60 characters.
 */
export const MOD_SAFETY_GUIDE_TITLE = 'Are Claude Code Mods Safe? What a Mod Can Touch'

export const MOD_SAFETY_GUIDE_DATES = { published: '2026-10-13', modified: '2026-10-23' } as const

/** /guide/are-claude-code-mods-safe meta description — the description tag, OG, and JSON-LD. */
export const MOD_SAFETY_GUIDE_DESCRIPTION =
  'A Claude Code mod runs with your permissions. See what claude plugin validate reports, how statuslin.es pins and reviews each mod, and what to check yourself.'

export const HOW_IT_WORKS_PATH = '/how-it-works'

/** /how-it-works title — the <title> tag and its JSON-LD headline. */
export const HOW_IT_WORKS_TITLE = 'How statuslin.es Checks Claude Code Mods & Status Lines'

/** The page's h1, and the name a link to it gives. */
export const HOW_IT_WORKS_HEADING = 'How statuslin.es checks mods and status lines'

export const HOW_IT_WORKS_DATES = { published: '2026-10-22', modified: '2026-10-23' } as const

/** /how-it-works meta description — the description tag, OG, and JSON-LD. */
export const HOW_IT_WORKS_DESCRIPTION =
  "Every Claude Code mod and status line on statuslin.es is pinned to one version, run in a sandbox for its previews and reviewed before it's listed."

export const NOT_SHOWING_GUIDE_PATH = '/guide/status-line-not-showing'

/**
 * /guide/status-line-not-showing title — the <title> tag and its JSON-LD headline. It leaves out
 * ` | statuslin.es`, which would push it past 60 characters.
 */
export const NOT_SHOWING_GUIDE_TITLE = 'Claude Code Status Line Not Showing? How to Fix It'

export const NOT_SHOWING_GUIDE_DATES = { published: '2026-10-18', modified: '2026-10-23' } as const

/** /guide/status-line-not-showing meta description — the description tag, OG, and JSON-LD. */
export const NOT_SHOWING_GUIDE_DESCRIPTION =
  'Why a Claude Code status line stays blank in the terminal: script permissions, stdout, workspace trust, settings that turn it off, and how to debug it.'

export const BUDDY_GUIDE_PATH = '/guide/claude-code-buddy'

/**
 * /guide/claude-code-buddy title — the <title> tag and its JSON-LD headline. It leaves out
 * ` | statuslin.es`, which would push it past 60 characters.
 */
export const BUDDY_GUIDE_TITLE = 'Claude Code Buddy Removed? Pet Mods That Replace It'

export const BUDDY_GUIDE_DATES = { published: '2026-10-17', modified: '2026-10-23' } as const

/** /guide/claude-code-buddy meta description — the description tag, OG, and JSON-LD. */
export const BUDDY_GUIDE_DESCRIPTION =
  "Users report Claude Code's /buddy gone since 2.1.97. These community pet mods put a pixel companion back, each with a real preview and what it can touch."

/** The live /guide subpages and their last edits. Every other /guide/* path redirects to /guide. */
export const GUIDE_SUBPAGES: ReadonlyArray<{ path: string; modified: string }> = [
  { path: DESKTOP_GUIDE_PATH, modified: DESKTOP_GUIDE_DATES.modified },
  { path: STATUS_LINES_VS_MODS_GUIDE_PATH, modified: STATUS_LINES_VS_MODS_GUIDE_DATES.modified },
  { path: MOD_SAFETY_GUIDE_PATH, modified: MOD_SAFETY_GUIDE_DATES.modified },
  { path: NOT_SHOWING_GUIDE_PATH, modified: NOT_SHOWING_GUIDE_DATES.modified },
  { path: BUDDY_GUIDE_PATH, modified: BUDDY_GUIDE_DATES.modified },
]

export function resourcesTitle(sections: ResourceSection[]): string {
  const tools = sections.find((s) => s.key === 'tools')?.resources ?? []
  const lead = tools.slice(0, 2).map((t) => t.name)
  return `${lead.join(', ')} & More Claude Code Tools`
}

export const RESOURCES_TITLE_BASE = resourcesTitle(RESOURCE_SECTIONS)
