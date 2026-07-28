/**
 * The `/sitemap.xml` builder. Lists the static public pages plus one `<url>` per published config
 * so crawlers discover the long-tail config pages without relying on link-following alone.
 *
 * `<lastmod>` uses the current version's review date, falling back to config creation, formatted
 * as a W3C date. Facets and the homepage inherit the newest matching/published config date.
 * `<priority>`/`<changefreq>` are omitted on purpose: Google ignores them.
 */

/** Published config rows the sitemap needs — just enough to build each `<url>`. */
export interface SitemapConfig {
  slug: string
  updatedAt: Date
}

/** Indexable facet pages the sitemap should list (already filtered to the shared threshold). */
export interface SitemapFacet {
  slug: string
  latest: Date | null
}

/** Always-present public pages, as paths relative to the origin. */
const STATIC_PATHS = ['/', '/resources', '/submit', '/terms']

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
  const homepageUpdatedAt = configs.reduce<Date | null>(
    (latest, config) => (latest === null || config.updatedAt > latest ? config.updatedAt : latest),
    null,
  )
  const staticEntries = STATIC_PATHS.map((path) =>
    path === '/'
      ? urlEntry(base, homepageUpdatedAt?.toISOString().slice(0, 10))
      : urlEntry(`${base}${path}`),
  )
  const facetEntries = facets.map((f) =>
    urlEntry(
      `${base}/status-lines/${f.slug}`,
      f.latest ? f.latest.toISOString().slice(0, 10) : undefined,
    ),
  )
  const configEntries = configs.map((c) =>
    urlEntry(`${base}/c/${c.slug}`, c.updatedAt.toISOString().slice(0, 10)),
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
