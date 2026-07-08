import { FACET_INTRO } from '@/gallery/facet-copy'
import type { Interpreter } from '@/render/types'

/**
 * The facet registry: the single source of truth for the /status-lines/<facet> pages and the
 * tag vocabulary. A facet page can only exist for an entry here; a tag can only be stored on a
 * config if it is a tag-facet slug (TAG_VOCABULARY). Titles use modified keywords on purpose;
 * the bare head term belongs to the home page. titleBase/heading/metaDescription/intro are SEO
 * copy (intro lives in facet-copy.ts), required only when page: true. */
export interface Facet {
  slug: string
  group: 'interpreter' | 'capability' | 'feature'
  /** true = standalone /status-lines/<slug> page + sitemap entry; false = badge + filter only. */
  page: boolean
  /** group 'interpreter' only: the configs.interpreter value this facet selects. */
  interpreter?: Interpreter
  /** Short label for tag chips / the filter dropdown. Required for every tag. */
  chipLabel: string
  titleBase?: string
  heading?: string
  metaDescription?: string
  intro?: string[]
}

export const FACETS: Facet[] = [
  {
    slug: 'git',
    group: 'feature',
    page: true,
    chipLabel: 'git',
    titleBase: 'Claude Code Status Lines That Show Git Status',
    heading: 'Claude Code status lines that show git status',
    metaDescription:
      'Status lines that put your git branch, dirty state, or diff stats in the Claude Code terminal. Rendered previews you can copy in one paste.',
    intro: FACET_INTRO.git,
  },
  {
    slug: 'token-usage',
    group: 'feature',
    page: true,
    chipLabel: 'tokens',
    titleBase: 'Claude Code Status Lines That Show Token Usage',
    heading: 'Claude Code status lines that show token usage',
    metaDescription:
      'Status lines that track context window usage in the Claude Code terminal, as token counts or burn bars. Copy one in a single paste.',
    intro: FACET_INTRO['token-usage'],
  },
  {
    slug: 'cost',
    group: 'feature',
    page: true,
    chipLabel: 'cost',
    titleBase: 'Claude Code Status Lines That Track Cost',
    heading: 'Claude Code status lines that track cost',
    metaDescription:
      'Status lines that show what a Claude Code session costs as you work, from plain dollar figures to burn-rate meters. Rendered previews, one-paste install.',
    intro: FACET_INTRO.cost,
  },
  {
    slug: 'quota',
    group: 'feature',
    page: true,
    chipLabel: 'limits',
    titleBase: 'Claude Code Status Lines That Track Usage Limits',
    heading: 'Claude Code status lines that track usage limits',
    metaDescription:
      'Status lines that watch your Claude Code rate limits: 5-hour and weekly quota percentages, reset times, and overage warnings.',
    intro: FACET_INTRO.quota,
  },
  {
    slug: 'burn-rate',
    group: 'feature',
    page: true,
    chipLabel: 'burn rate',
    titleBase: 'Claude Code Status Lines That Show Burn Rate',
    heading: 'Claude Code status lines that show burn rate',
    metaDescription:
      'Status lines that show how fast a Claude Code session is burning tokens, cost, or quota: hourly burn rates and over/under-pace arrows. Rendered previews, one-paste install.',
    intro: FACET_INTRO['burn-rate'],
  },
  {
    slug: 'weather',
    group: 'feature',
    page: true,
    chipLabel: 'weather',
    titleBase: 'Claude Code Status Lines That Show the Weather',
    heading: 'Claude Code status lines that show the weather',
    metaDescription:
      'Claude Code status lines that pull live weather into your terminal next to model, git, and usage. Rendered previews, one-paste install.',
    intro: FACET_INTRO.weather,
  },
  {
    slug: 'markets',
    group: 'feature',
    page: true,
    chipLabel: 'markets',
    titleBase: 'Claude Code Status Lines That Show Market Data',
    heading: 'Claude Code status lines that show market data',
    metaDescription:
      'Claude Code status lines that show live market data — crypto prices, stocks, or exchange rates — beside your coding metrics. Rendered previews, one-paste install.',
    intro: FACET_INTRO.markets,
  },
  {
    slug: 'minimal',
    group: 'feature',
    page: true,
    chipLabel: 'minimal',
    titleBase: 'Minimal Claude Code Status Lines',
    heading: 'Minimal Claude Code status lines',
    metaDescription:
      'Single-line, low-noise Claude Code status lines that show just the essentials. Rendered previews you can copy in one paste.',
    intro: FACET_INTRO.minimal,
  },
  {
    slug: 'multi-line',
    group: 'feature',
    page: true,
    chipLabel: 'multi-line',
    titleBase: 'Multi-Line Claude Code Status Lines',
    heading: 'Multi-line Claude Code status lines',
    metaDescription:
      'Claude Code status lines that use two or more lines to fit a fuller dashboard: model, git, tokens, cost, and more at a glance.',
    intro: FACET_INTRO['multi-line'],
  },
  {
    slug: 'powerline',
    group: 'feature',
    page: true,
    chipLabel: 'powerline',
    titleBase: 'Powerline-Style Claude Code Status Lines',
    heading: 'Powerline-style Claude Code status lines',
    metaDescription:
      'Powerline-style Claude Code status lines with segment separators and Nerd Font glyphs. See rendered previews before you commit to a font.',
    intro: FACET_INTRO.powerline,
  },
  {
    slug: 'themed',
    group: 'feature',
    page: true,
    chipLabel: 'themed',
    titleBase: 'Themed Claude Code Status Lines',
    heading: 'Themed Claude Code status lines',
    metaDescription:
      'Claude Code status lines built on Catppuccin, Dracula, and other terminal color themes, rendered so you can compare palettes.',
    intro: FACET_INTRO.themed,
  },
  {
    slug: 'bash',
    group: 'interpreter',
    page: true,
    interpreter: 'bash',
    chipLabel: 'bash',
    titleBase: 'Claude Code Status Lines Written in Bash',
    heading: 'Claude Code status lines written in bash',
    metaDescription:
      'Bash Claude Code status lines that run with standard Unix tools, no runtime to install. Rendered previews, one-paste install.',
    intro: FACET_INTRO.bash,
  },
  {
    slug: 'python',
    group: 'interpreter',
    page: true,
    interpreter: 'python',
    chipLabel: 'python',
    titleBase: 'Claude Code Status Lines Written in Python',
    heading: 'Claude Code status lines written in Python',
    metaDescription:
      'Python Claude Code status lines, for richer formatting and logic than a shell one-liner. Rendered previews you can copy.',
    intro: FACET_INTRO.python,
  },
  {
    slug: 'node',
    group: 'interpreter',
    page: true,
    interpreter: 'node',
    chipLabel: 'node',
    titleBase: 'Claude Code Status Lines Written in Node.js',
    heading: 'Claude Code status lines written in Node.js',
    metaDescription:
      'Node.js Claude Code status lines. JSON parsing without jq, and the npm ecosystem when a config needs it. Rendered previews you can copy.',
    intro: FACET_INTRO.node,
  },
  { slug: 'network-access', group: 'capability', page: false, chipLabel: 'network access' },
  { slug: 'reads-token', group: 'capability', page: false, chipLabel: 'reads token' },
]

export const FACET_BY_SLUG = new Map(FACETS.map((f) => [f.slug, f]))

/** Display form of a tag's chipLabel: each word capitalized, so the chips and filter menu read
 * as proper labels. Data (chipLabel, slugs, SEO keywords) stays lowercase — this is presentation
 * only. Word boundaries include hyphens, so `multi-line` → `Multi-Line`. */
export function tagLabel(chipLabel: string): string {
  return chipLabel.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Valid values for configs.tags (the classifier's curated column): the feature-group slugs. */
export const TAG_VOCABULARY = FACETS.filter((f) => f.group === 'feature').map((f) => f.slug)

/** Every registry slug in display order — the union order for merged tags + the filter list. */
export const ALL_TAG_SLUGS = FACETS.map((f) => f.slug)

/** Where a tag's badge links: its page when it has one, else the tag-filtered home. */
export function tagHref(
  slug: string,
):
  | { to: '/status-lines/$facet'; params: { facet: string } }
  | { to: '/'; search: { tags: string } } {
  const facet = FACET_BY_SLUG.get(slug)
  return facet?.page
    ? { to: '/status-lines/$facet', params: { facet: slug } }
    : { to: '/', search: { tags: slug } }
}
