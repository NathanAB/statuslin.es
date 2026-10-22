import {
  GUIDE_DATES,
  GUIDE_PATH,
  GUIDE_SUBPAGES,
  HOW_IT_WORKS_DATES,
  HOW_IT_WORKS_PATH,
} from '@/lib/page-title'
import { MODS_PATH, modPath } from '@/lib/site'

/**
 * The `/sitemap.xml` builder. Lists the static public pages plus one `<url>` per published config
 * and mod so crawlers discover the long-tail pages without relying on link-following alone.
 *
 * `<lastmod>` is the day of the page's last real change, from data: an item's current version
 * going live, the newest item a listing shows, a guide's edit date. A page with no such source
 * gets no `<lastmod>`, never the build or request time.
 * `<priority>`/`<changefreq>` are omitted on purpose: Google ignores them.
 */

/** Published config rows the sitemap needs — just enough to build each `<url>`. */
export interface SitemapConfig {
  slug: string
  updatedAt: Date
}

/** `updatedAt` is the date of the mod's current version. */
export interface SitemapMod {
  slug: string
  updatedAt: Date
}

/** A page dated by what it lists (the best page, comparisons); `updatedAt` null omits the date. */
export interface SitemapPage {
  path: string
  updatedAt: Date | null
}

/** Indexable facet pages the sitemap should list (already filtered to the shared threshold). */
export interface SitemapFacet {
  slug: string
  latest: Date | null
}

const STATIC_PAGES: Array<{ path: string; lastmod?: string }> = [
  { path: GUIDE_PATH, lastmod: GUIDE_DATES.modified },
  ...GUIDE_SUBPAGES.map(({ path, modified }) => ({ path, lastmod: modified })),
  { path: '/resources' },
  { path: HOW_IT_WORKS_PATH, lastmod: HOW_IT_WORKS_DATES.modified },
  { path: '/terms' },
]

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

/** The latest of the given dates, or null when none is known. */
export function newestDate(dates: Array<Date | null>): Date | null {
  return dates.reduce<Date | null>(
    (latest, date) => (date !== null && (latest === null || date > latest) ? date : latest),
    null,
  )
}

function newest(items: Array<{ updatedAt: Date }>): Date | null {
  return newestDate(items.map((item) => item.updatedAt))
}

function isoDay(date: Date | null): string | undefined {
  return date?.toISOString().slice(0, 10)
}

function buildSitemapXml(
  base: string,
  configs: SitemapConfig[],
  facets: SitemapFacet[],
  pageCount: number,
  listingPages: SitemapPage[],
  mods: SitemapMod[],
): string {
  const homepageLastmod = newest([...configs, ...mods])
    ?.toISOString()
    .slice(0, 10)
  const staticEntries = [
    urlEntry(base, homepageLastmod),
    ...STATIC_PAGES.map((page) => urlEntry(`${base}${page.path}`, page.lastmod)),
    ...listingPages.map((page) => urlEntry(`${base}${page.path}`, isoDay(page.updatedAt))),
  ]
  const pageEntries: string[] = []
  for (let page = 2; page <= pageCount; page++) {
    pageEntries.push(urlEntry(`${base}/?page=${page}`, homepageLastmod))
  }
  const facetEntries = facets.map((f) =>
    urlEntry(
      `${base}/status-lines/${f.slug}`,
      f.latest ? f.latest.toISOString().slice(0, 10) : undefined,
    ),
  )
  const configEntries = configs.map((c) =>
    urlEntry(`${base}/c/${c.slug}`, c.updatedAt.toISOString().slice(0, 10)),
  )
  const modsUpdatedAt = newest(mods)
  const modEntries =
    modsUpdatedAt === null
      ? []
      : [
          urlEntry(`${base}${MODS_PATH}`, modsUpdatedAt.toISOString().slice(0, 10)),
          ...mods.map((m) =>
            urlEntry(`${base}${modPath(m.slug)}`, m.updatedAt.toISOString().slice(0, 10)),
          ),
        ]
  const body = [
    ...staticEntries,
    ...pageEntries,
    ...facetEntries,
    ...configEntries,
    ...modEntries,
  ].join('\n')
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
  pageCount = 1,
  listingPages: SitemapPage[] = [],
  mods: SitemapMod[] = [],
): Response {
  return new Response(buildSitemapXml(base, configs, facets, pageCount, listingPages, mods), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'max-age=3600',
    },
  })
}
