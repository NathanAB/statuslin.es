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

const MAX_SUMMARY_CHARS = 160

export function buildLlmsTxt(
  base: string,
  facets: Array<{ slug: string; label: string }>,
  configs: LlmsConfig[] = [],
): string {
  const blocks = [
    '# statuslin.es',
    '> Community gallery of Claude Code status lines: browse real, sandbox-rendered previews and copy one into your own setup.',
    "statuslin.es is a curated, open gallery of status lines for Anthropic's Claude Code CLI. Every submission is a shell script; the site runs it in a sandbox and shows the actual rendered terminal output, plus its copy count and a one-command copy to adopt it. It is a curation-first gallery, not documentation.",
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
    `- [Resources](${base}/resources): related Claude Code status line tools`,
  ]
}

function facetLink(base: string, facet: { slug: string; label: string }): string {
  return `- [${facet.label}](${base}/status-lines/${facet.slug})`
}

function configLink(base: string, config: LlmsConfig): string {
  const summary = oneLine(config.description)
  const copies = `Copied ${config.copyCount} ${config.copyCount === 1 ? 'time' : 'times'}.`
  return `- [${config.title}](${base}/c/${config.slug}): ${summary ? `${summary} ` : ''}${copies}`
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= MAX_SUMMARY_CHARS)
    return flat === '' || /[.!?]$/.test(flat) ? flat : `${flat}.`
  const cut = flat.slice(0, MAX_SUMMARY_CHARS - 1)
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
