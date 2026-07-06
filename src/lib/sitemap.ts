/**
 * The `/sitemap.xml` builder. Lists the static public pages plus one `<url>` per published config
 * so crawlers discover the long-tail config pages without relying on link-following alone.
 *
 * `<lastmod>` uses each config's `createdAt` (the configs table tracks no update time) formatted
 * as a W3C date — Google only trusts `lastmod` when it's verifiably accurate, and a config's page
 * doesn't change after creation. `<priority>`/`<changefreq>` are omitted on purpose: Google
 * ignores them.
 */

/** Published config rows the sitemap needs — just enough to build each `<url>`. */
export interface SitemapConfig {
  slug: string
  createdAt: Date
}

/** Live facet pages the sitemap should list (already filtered to >= MIN_FACET_CONFIGS). */
export interface SitemapFacet {
  slug: string
  latest: Date | null
}

/** Always-present public pages, as paths relative to the origin. */
const STATIC_PATHS = ['/', '/guide', '/resources', '/submit', '/terms']

/** Escape the five XML entities so a slug with `&`/`<` can't break the document. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function urlEntry(loc: string, lastmod?: string): string {
  const tail = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>${tail}\n  </url>`
}

function buildSitemapXml(base: string, configs: SitemapConfig[], facets: SitemapFacet[]): string {
  const staticEntries = STATIC_PATHS.map((path) => urlEntry(path === '/' ? base : `${base}${path}`))
  const facetEntries = facets.map((f) =>
    urlEntry(
      `${base}/status-lines/${f.slug}`,
      f.latest ? f.latest.toISOString().slice(0, 10) : undefined,
    ),
  )
  const configEntries = configs.map((c) =>
    urlEntry(`${base}/c/${c.slug}`, c.createdAt.toISOString().slice(0, 10)),
  )
  const body = [...staticEntries, ...facetEntries, ...configEntries].join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/**
 * The `/sitemap.xml` HTTP response. `Cache-Control: max-age=3600` matches the config OG cards: a
 * new submission shows up within the hour without re-rendering the sitemap on every crawl hit.
 */
export function sitemapResponse(
  base: string,
  configs: SitemapConfig[],
  facets: SitemapFacet[],
): Response {
  return new Response(buildSitemapXml(base, configs, facets), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'max-age=3600',
    },
  })
}
