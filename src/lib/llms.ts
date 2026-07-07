/**
 * The `/llms.txt` body (see llmstxt.org) — a plain-markdown map of the site for AI answer
 * engines (ChatGPT, Claude, Perplexity) so they can understand and cite the gallery without
 * scraping the whole DOM. Google doesn't use this file; the non-Google engines that are our
 * citation audience do. `base` comes from the one origin source so every link is correct per
 * environment. Facets are the *live* ones only (never link a facet page that would 404).
 */
export function buildLlmsTxt(base: string, facets: Array<{ slug: string; label: string }>): string {
  const blocks = [
    '# statuslin.es',
    '> Community gallery of Claude Code status lines: browse real, sandbox-rendered previews, upvote the best, and copy one into your own setup.',
    "statuslin.es is a curated, open gallery of status lines for Anthropic's Claude Code CLI. Every submission is a shell script; the site runs it in a sandbox and shows the actual rendered terminal output, plus community upvotes and a one-command copy to adopt it. It is a curation-first gallery, not documentation.",
    ['## Browse', '', ...corePageLinks(base)].join('\n'),
  ]
  if (facets.length > 0) {
    blocks.push(['## Browse by feature', '', ...facets.map((f) => facetLink(base, f))].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}

function corePageLinks(base: string): string[] {
  return [
    `- [Gallery](${base}/): every published status line, sorted by newest and most upvoted`,
    `- [Submit a status line](${base}/submit): add your own`,
    `- [Resources](${base}/resources): related Claude Code status line tools`,
  ]
}

function facetLink(base: string, facet: { slug: string; label: string }): string {
  return `- [${facet.label}](${base}/status-lines/${facet.slug})`
}

/**
 * The `/llms.txt` HTTP response. `Cache-Control: max-age=86400` lets a CDN hold it a day — the
 * facet set changes rarely, and a day-stale map is harmless.
 */
export function llmsResponse(
  base: string,
  facets: Array<{ slug: string; label: string }>,
): Response {
  return new Response(buildLlmsTxt(base, facets), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400',
    },
  })
}
