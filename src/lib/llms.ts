import {
  DESKTOP_GUIDE_PATH,
  MOD_SAFETY_GUIDE_PATH,
  MOD_SAFETY_GUIDE_TITLE,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_TITLE,
} from '@/lib/page-title'
import { MARKETPLACE_PATH, MODS_PATH, modPath } from '@/lib/site'

/**
 * The `/llms.txt` body (see llmstxt.org) — a plain-markdown map of the site for AI answer
 * engines (ChatGPT, Claude, Perplexity) so they can understand and cite the gallery without
 * scraping the whole DOM. Google doesn't use this file; the non-Google engines that are our
 * citation audience do. `base` comes from the one origin source so every link is correct per
 * environment. Facets are the *live* ones only (never link a facet page that would 404).
 */
export interface LlmsConfig {
  slug: string
  title: string
  description: string
  copyCount: number
}

export interface LlmsMod {
  slug: string
  title: string
  description: string
  copyCount: number
}

const MAX_SUMMARY_CHARS = 160

export function buildLlmsTxt(
  base: string,
  facets: Array<{ slug: string; label: string }>,
  configs: LlmsConfig[] = [],
  mods: LlmsMod[] = [],
): string {
  const blocks = [
    '# statuslin.es',
    '> A gallery of Claude Code status lines and mods. Status lines are submitted by the community. Browse real previews, then copy a status line or install a mod.',
    "statuslin.es is a curated, open gallery of status lines for Anthropic's Claude Code CLI. It holds two kinds of entry: status line shell scripts, which the community submits, and mods, which are Claude Code plugins. The site shows each one's real output, rendered in a sandbox or, for a mod that draws only in Claude Desktop, as a screenshot, plus its copy count and a one-command copy or install. It is a curation-first gallery, not documentation.",
    ['## Browse', '', ...corePageLinks(base)].join('\n'),
  ]
  if (facets.length > 0) {
    blocks.push(['## Browse by feature', '', ...facets.map((f) => facetLink(base, f))].join('\n'))
  }
  if (configs.length > 0) {
    blocks.push(['## Top status lines', '', ...configs.map((c) => configLink(base, c))].join('\n'))
  }
  if (mods.length > 0) {
    blocks.push(
      ['## Mods', '', ...mods.map((m) => summaryLink(`${base}${modPath(m.slug)}`, m))].join('\n'),
    )
  }
  return `${blocks.join('\n\n')}\n`
}

function corePageLinks(base: string): string[] {
  return [
    `- [Gallery](${base}/): every published status line and mod, sorted by trending, newest, or most copied`,
    `- [Mods](${base}${MODS_PATH}): every published mod, a Claude Code plugin you install with one command`,
    `- [Plugin marketplace](${base}${MARKETPLACE_PATH}): the published mods as a Claude Code plugin marketplace`,
    `- [Submit a status line](${base}/submit): add your own`,
    `- [Guide](${base}/guide): how to wire a Claude Code status line by hand, with a tested example`,
    `- [Status line not showing in Claude Desktop](${base}${DESKTOP_GUIDE_PATH}): why the Desktop Code tab skips custom status lines, and the plugin that shows them`,
    `- [${STATUS_LINES_VS_MODS_GUIDE_TITLE}](${base}${STATUS_LINES_VS_MODS_GUIDE_PATH}): what a status line and a mod are, where each shows up, and when to pick which`,
    `- [${MOD_SAFETY_GUIDE_TITLE}](${base}${MOD_SAFETY_GUIDE_PATH}): what an installed mod can do, what claude plugin validate reports, and how statuslin.es pins and reviews each mod`,
    `- [Resources](${base}/resources): related Claude Code status line tools`,
  ]
}

function facetLink(base: string, facet: { slug: string; label: string }): string {
  return `- [${facet.label}](${base}/status-lines/${facet.slug})`
}

function configLink(base: string, config: LlmsConfig): string {
  return summaryLink(`${base}/c/${config.slug}`, config)
}

function summaryLink(
  url: string,
  item: { title: string; description: string; copyCount: number },
): string {
  const summary = escapeMarkdownLinks(oneLine(item.description))
  // A count of 0 tells a reader nothing, so a new entry carries none.
  const copies =
    item.copyCount > 0 ? `Copied ${item.copyCount} ${item.copyCount === 1 ? 'time' : 'times'}.` : ''
  const text = [summary, copies].filter(Boolean).join(' ')
  return `- [${escapeMarkdownLinks(flat(item.title))}](${url})${text ? `: ${text}` : ''}`
}

/** Authors write titles and descriptions, so a `](` or `<url>` in them must not forge a link. */
function escapeMarkdownLinks(text: string): string {
  return text.replace(/[\\[\]<>]/g, (c) => `\\${c}`)
}

function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function oneLine(text: string): string {
  const line = flat(text)
  if (line.length <= MAX_SUMMARY_CHARS)
    return line === '' || /[.!?]$/.test(line) ? line : `${line}.`
  const cut = line.slice(0, MAX_SUMMARY_CHARS - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

export function llmsResponse(
  base: string,
  facets: Array<{ slug: string; label: string }>,
  configs: LlmsConfig[] = [],
  mods: LlmsMod[] = [],
): Response {
  return new Response(buildLlmsTxt(base, facets, configs, mods), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400',
    },
  })
}
