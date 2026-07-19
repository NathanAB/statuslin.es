/**
 * The `/robots.txt` body. A single `User-agent: *` group allows every crawler — including the
 * AI/answer-engine bots (GPTBot, ClaudeBot, Google-Extended, PerplexityBot) we *want* citing the
 * gallery — and blocks only the JSON API, which has no HTML search value. Private HTML pages use
 * their own `noindex` tags so crawlers must be able to fetch them. The absolute `Sitemap:` line is
 * how crawlers discover every config page; `base` comes from the one origin source so it's correct
 * per environment.
 */
export function buildRobotsTxt(base: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * The `/robots.txt` HTTP response. `Cache-Control: max-age=86400` lets a CDN hold it a day —
 * the rules change rarely, so a one-day window is plenty fresh.
 */
export function robotsResponse(base: string): Response {
  return new Response(buildRobotsTxt(base), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400',
    },
  })
}
