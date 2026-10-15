import {
  DESKTOP_GUIDE_PATH,
  DESKTOP_GUIDE_TITLE_BASE,
  GUIDE_PATH,
  GUIDE_TITLE_BASE,
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
    '> A gallery of Claude Code status lines and mods, each with a real preview. Copy a status line in one paste or install a mod with one command.',
    "Status lines are scripts whose output Claude Code shows under the prompt. Mods are Claude Code plugins that draw in the terminal or in Claude Desktop's Code tab. Each entry shows its real output, rendered in a sandbox. A mod that draws only in Claude Desktop shows a screenshot instead.",
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
    `- [Mods](${base}${MODS_PATH}): every published mod`,
    `- [Plugin marketplace](${base}${MARKETPLACE_PATH}): the published mods as a Claude Code plugin marketplace`,
    `- [Submit](${base}/submit): send in a status line, or a mod by its GitHub link`,
    `- [${GUIDE_TITLE_BASE}](${base}${GUIDE_PATH}): the statusLine setting, the JSON a script receives, and a tested example`,
    `- [${DESKTOP_GUIDE_TITLE_BASE}](${base}${DESKTOP_GUIDE_PATH}): why the Code tab skips status lines, and the plugin that shows them`,
    `- [${STATUS_LINES_VS_MODS_GUIDE_TITLE}](${base}${STATUS_LINES_VS_MODS_GUIDE_PATH}): where each one shows up, and when to pick which`,
    `- [${MOD_SAFETY_GUIDE_TITLE}](${base}${MOD_SAFETY_GUIDE_PATH}): what a mod can do, and how statuslin.es pins and reviews each one`,
    `- [Resources](${base}/resources): other Claude Code status line tools, generators, and guides`,
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
