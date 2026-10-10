import { DESKTOP_GUIDE_PATH } from '@/lib/page-title'
import { modPath } from '@/lib/site'

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
): string {
  const blocks = [
    '# statuslin.es',
    '> Community gallery of Claude Code status lines: browse real, sandbox-rendered previews and copy one into your own setup.',
    "statuslin.es is a curated, open gallery of status lines for Anthropic's Claude Code CLI. It holds two kinds of submission: status line shell scripts, and mods, which are Claude Code plugins. The site shows each one's real output, rendered in a sandbox or, for a mod that draws only in Claude Desktop, as a screenshot, plus its copy count and a one-command copy or install. It is a curation-first gallery, not documentation.",
    ['## Browse', '', ...corePageLinks(base)].join('\n'),
  ]
  if (facets.length > 0) {
    blocks.push(['## Browse by feature', '', ...facets.map((f) => facetLink(base, f))].join('\n'))
  }
  if (configs.length > 0) {
    blocks.push(['## Top status lines', '', ...configs.map((c) => configLink(base, c))].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}

function corePageLinks(base: string): string[] {
  return [
    `- [Gallery](${base}/): every published status line, sorted by trending, newest, or most copied`,
    `- [Submit a status line](${base}/submit): add your own`,
    `- [Guide](${base}/guide): how to wire a Claude Code status line by hand, with a tested example`,
    `- [Status line not showing in Claude Desktop](${base}${DESKTOP_GUIDE_PATH}): why the Desktop Code tab skips custom status lines, and the plugin that shows them`,
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
  const summary = inertMarkdown(oneLine(item.description))
  const copies = `Copied ${item.copyCount} ${item.copyCount === 1 ? 'time' : 'times'}.`
  return `- [${inertMarkdown(flat(item.title))}](${url}): ${summary ? `${summary} ` : ''}${copies}`
}

/** Authors write titles and descriptions, so a `](` or `<url>` in them must not forge a link. */
function inertMarkdown(text: string): string {
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
): Response {
  return new Response(buildLlmsTxt(base, facets, configs), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400',
    },
  })
}

/** The gallery builds `/llms.txt` without knowing about mods, so they are appended to its response. */
export async function withModLinks(
  llms: Response,
  base: string,
  mods: LlmsMod[],
): Promise<Response> {
  const txt = await llms.text()
  const body =
    mods.length === 0
      ? txt
      : `${txt}\n${['## Mods', '', ...mods.map((m) => summaryLink(`${base}${modPath(m.slug)}`, m))].join('\n')}\n`
  return new Response(body, { status: llms.status, headers: llms.headers })
}
