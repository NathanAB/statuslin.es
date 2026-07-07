import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { FACETS, MIN_FACET_CONFIGS } from '@/gallery/facets'
import { auth } from '@/lib/auth'
import { resolveSourceHtml } from '@/lib/highlight'
import { withHttpStatus } from '@/lib/http.server'
import { llmsResponse } from '@/lib/llms'
import { siteUrl } from '@/lib/site'
import { sitemapResponse } from '@/lib/sitemap'
import {
  coerceSort,
  type GallerySort,
  getConfigBySlug,
  getFacetCards,
  getFacetStats,
  getPublishedConfigs,
  getPublishedCount,
  getPublishedSlugsForSitemap,
  getRelatedConfigs,
  liveFacetLinks,
  PAGE_SIZE,
  resolveLiveFacet,
} from './queries'

/**
 * The `/sitemap.xml` response. Lives here (not in the route file) because route files can't import
 * the db client directly — they reach gallery data through this module, the same way the og image
 * routes call into `@/og/routes`. Keeps `createdAt` a real `Date` by avoiding the server-fn RPC
 * boundary that would serialize it to a string.
 */
// createServerOnlyFn keeps `db` (and the whole postgres driver) out of the CLIENT bundle: this
// module is imported by client components for the server functions below, and a plain function
// touching `db` here would drag the Node-only postgres driver into the browser, where it throws
// `Buffer is not defined` and kills hydration. The server-only wrapper strips the body (and its
// `db` reference) from the client build. It also avoids the server-fn RPC boundary, so the
// sitemap's `createdAt` stays a real `Date` instead of being serialized to a string.
export const sitemapResponseForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const stats = await getFacetStats(db)
  const facets = FACETS.filter((f) => (stats.get(f.slug)?.count ?? 0) >= MIN_FACET_CONFIGS).map(
    (f) => ({ slug: f.slug, latest: stats.get(f.slug)?.latest ?? null }),
  )
  return sitemapResponse(siteUrl(), await getPublishedSlugsForSitemap(db), facets)
})

/**
 * The `/llms.txt` response. Server-only for the same reason as the sitemap: it reads live facet
 * counts from `db`, which route files can't import. Lists only facets past `MIN_FACET_CONFIGS`
 * so the map never points AI engines at a facet page that would 404.
 */
export const llmsTxtResponseForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const stats = await getFacetStats(db)
  const facets = FACETS.filter((f) => (stats.get(f.slug)?.count ?? 0) >= MIN_FACET_CONFIGS).map(
    (f) => ({ slug: f.slug, label: f.heading ?? f.chipLabel }),
  )
  return llmsResponse(siteUrl(), facets)
})

export const getGallery = createServerFn({ method: 'GET' })
  .inputValidator((d: { sort?: GallerySort; page?: number }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const sort = coerceSort(data.sort)
      const total = await getPublishedCount(db)
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
      // Clamp so a stale ?page= past the end still lands on the last real page.
      const page = Math.min(Math.max(1, data.page ?? 1), pageCount)
      return {
        cards: await getPublishedConfigs(db, sort, page),
        page,
        pageCount,
        liveFacets: liveFacetLinks(await getFacetStats(db)),
      }
    }),
  )

export const getConfigDetail = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      const userId = session?.user?.id
      const detail = await getConfigBySlug(db, data.slug, userId)
      if (!detail) return null
      // Use the HTML highlighted at submit time when present; only fall back to live Shiki for
      // versions without it. Either way the browser gets escaped HTML, never Shiki itself.
      // resolveSourceHtml always returns a string, so this overrides the nullable ConfigDetail
      // .sourceHtml with a non-null value — the detail page can render it directly.
      const related = await getRelatedConfigs(db, data.slug)
      const stats = await getFacetStats(db)
      const facetLinks = detail.tags
        .map((tag) => resolveLiveFacet(tag, stats))
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .map((f) => ({ slug: f.slug, chipLabel: f.chipLabel }))
      return {
        ...detail,
        sourceHtml: await resolveSourceHtml(detail.sourceHtml, detail.source, detail.interpreter),
        related,
        facetLinks,
      }
    }),
  )

export const getFacetPage = createServerFn({ method: 'GET' })
  .inputValidator((d: { facet: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const stats = await getFacetStats(db)
      const facet = resolveLiveFacet(data.facet, stats)
      if (!facet) return null
      const [cards, total] = await Promise.all([getFacetCards(db, facet), getPublishedCount(db)])
      return {
        slug: facet.slug,
        cards,
        total,
        // Pre-formatted: a Date through the server-fn RPC boundary is the serialization
        // gamble the sitemapResponseForRoute comment above warns about; the page only
        // needs the display string anyway.
        updated: stats.get(facet.slug)?.latest?.toISOString().slice(0, 10) ?? null,
        // Other live facets, for the "more ways to browse" row (never link a 404).
        otherFacets: liveFacetLinks(stats, facet.slug),
      }
    }),
  )
