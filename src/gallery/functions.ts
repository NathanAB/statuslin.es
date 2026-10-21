import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { liveComparePages } from '@/compare/pages'
import { db } from '@/db'
import { FACET_BY_SLUG, tagKeywords } from '@/gallery/facets'
import { resolveSourceHtml } from '@/lib/highlight'
import { withHttpStatus } from '@/lib/http.server'
import { type LlmsCatalogEntry, type LlmsMod, llmsFullResponse, llmsResponse } from '@/lib/llms'
import { siteUrl } from '@/lib/site'
import { newestDate, type SitemapMod, type SitemapPage, sitemapResponse } from '@/lib/sitemap'
import { getConfigSource, getPublishedConfigCatalog, getPublishedConfigs } from './config-items'
import { topicHeading } from './facet-page-copy'
import { type FacetMod, getLatestCopyAt } from './facet-queries'
import type { GallerySource } from './gallery-items'
import { getPublishedInventory } from './inventory'
import {
  getCardsByCopies,
  getConfigBySlug,
  getFacetCards,
  getFacetStats,
  getPublishedSlugsForSitemap,
  getRelatedConfigs,
  isIndexableFacet,
  liveFacetLinks,
  PAGE_SIZE,
  primaryFacet,
  resolveLiveFacet,
} from './queries'
import { coerceSourceQuery } from './ranking'
import { rankedCard } from './why-line'

/**
 * The `/sitemap.xml` response. src/gallery cannot query mods, so the caller passes the published
 * ones in; they count toward the gallery pages, the facets and the dates like status lines. Lives
 * here (not in the route file) because route files can't import the db client directly — they
 * reach gallery data through this module, the same way the og image routes call into
 * `@/og/routes`. Keeps `updatedAt` a real `Date` by avoiding the server-fn RPC boundary that would
 * serialize it to a string.
 */
// createServerOnlyFn keeps `db` (and the whole postgres driver) out of the CLIENT bundle: this
// module is imported by client components for the server functions below, and a plain function
// touching `db` here would drag the Node-only postgres driver into the browser, where it throws
// `Buffer is not defined` and kills hydration. The server-only wrapper strips the body (and its
// `db` reference) from the client build. It also avoids the server-fn RPC boundary, so the
// sitemap's `updatedAt` stays a real `Date` instead of being serialized to a string.
export const sitemapResponseForRoute = createServerOnlyFn(
  async (mods: Array<SitemapMod & FacetMod>): Promise<Response> => {
    const stats = await getFacetStats(db, mods)
    const facets = liveFacetLinks(stats).map((facet) => ({
      slug: facet.slug,
      latest: stats.get(facet.slug)?.latest ?? null,
    }))
    const configs = await getPublishedSlugsForSitemap(db)
    const pageCount = Math.max(1, Math.ceil((configs.length + mods.length) / PAGE_SIZE))
    const listingPages = await datedListingPages(configs)
    return sitemapResponse(siteUrl(), configs, facets, pageCount, listingPages, mods)
  },
)

const BEST_LIMIT = 10

/**
 * The best page and the live comparison pages, each dated by the newest status line it lists
 * going live. The best page ranks by copies, so its newest copy dates it too, as its "as of" line
 * does; a comparison page also counts its tools' fact check.
 */
async function datedListingPages(
  configs: Array<{ slug: string; updatedAt: Date }>,
): Promise<SitemapPage[]> {
  const [cards, latestCopyAt] = await Promise.all([getCardsByCopies(db), getLatestCopyAt(db)])
  const liveSince = new Map(configs.map((c) => [c.slug, c.updatedAt]))
  const listed = (slugs: string[]) => slugs.map((slug) => liveSince.get(slug) ?? null)
  const bestSlugs = cards.slice(0, BEST_LIMIT).map((card) => card.slug)
  return [
    { path: '/status-lines/best', updatedAt: newestDate([latestCopyAt, ...listed(bestSlugs)]) },
    ...liveComparePages(cards).map((page) => ({
      path: page.path,
      updatedAt: newestDate([new Date(page.verifiedAt), ...listed(page.slugs)]),
    })),
  ]
}

/** `latestCopy` dates the page by its data, the UTC day of the newest copy, not the request day,
 * so the page claims no newer month than its ranking reflects. */
export const getBestPage = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () => {
    const [cards, latestCopyAt] = await Promise.all([
      getCardsByCopies(db, { limit: BEST_LIMIT }),
      getLatestCopyAt(db),
    ])
    return {
      items: cards.map(rankedCard),
      latestCopy: latestCopyAt?.toISOString().slice(0, 10) ?? null,
    }
  }),
)

/**
 * The live facets llms.txt and llms-full.txt link, by page heading (which says mods once the page
 * lists one). Lists only indexable page
 * facets that meet the shared inventory threshold, counting the published mods passed in.
 */
async function llmsFacets(mods: FacetMod[]): Promise<Array<{ slug: string; label: string }>> {
  const stats = await getFacetStats(db, mods)
  return liveFacetLinks(stats).map((link) => ({
    slug: link.slug,
    label: FACET_BY_SLUG.has(link.slug)
      ? topicHeading({
          slug: link.slug,
          mods: mods.filter((mod) => mod.tags.includes(link.slug)).length,
        })
      : link.chipLabel,
  }))
}

/**
 * The `/llms.txt` response. Server-only for the same reason as the sitemap: it reads live facet
 * counts from `db`, which route files can't import.
 */
export const llmsTxtResponseForRoute = createServerOnlyFn(
  async (mods: Array<LlmsMod & FacetMod>): Promise<Response> => {
    const facets = await llmsFacets(mods)
    const top = await getPublishedConfigs(db, 'top', 1)
    return llmsResponse(
      siteUrl(),
      facets,
      top.map(({ slug, title, description, copyCount }) => ({
        slug,
        title,
        description,
        copyCount,
      })),
      mods,
    )
  },
)

/** A published status line or mod with its tag slugs and its page copy. */
type LlmsCatalogRow = Omit<LlmsCatalogEntry, 'tagLabels'> & FacetMod

function llmsCatalogEntry(row: LlmsCatalogRow): LlmsCatalogEntry {
  const { slug, title, description, copyCount, generatedContent } = row
  return { slug, title, description, copyCount, tagLabels: tagKeywords(row.tags), generatedContent }
}

/**
 * The `/llms-full.txt` response: every published status line and the published mods passed in,
 * with the same facets as llms.txt. Server-only for the same reason as llms.txt.
 */
export const llmsFullTxtResponseForRoute = createServerOnlyFn(
  async (mods: LlmsCatalogRow[]): Promise<Response> => {
    const [facets, configs] = await Promise.all([llmsFacets(mods), getPublishedConfigCatalog(db)])
    return llmsFullResponse(
      siteUrl(),
      facets,
      configs.map(llmsCatalogEntry),
      mods.map(llmsCatalogEntry),
    )
  },
)

/** Narrows a caller's per-mod tag lists, since they arrive over the server-fn boundary. */
export function coerceModTags(value: unknown): FacetMod[] {
  if (!Array.isArray(value)) return []
  return value.map((tags) => ({
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
  }))
}

export const getGalleryConfigs = createServerFn({ method: 'GET' })
  .validator(coerceSourceQuery)
  .handler(({ data }) => withHttpStatus(() => getConfigSource(db, data)))

export const getGallery = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () => {
    const inventory = await getPublishedInventory(db)
    return { ...inventory, asOf: new Date().toISOString().slice(0, 10) }
  }),
)

export const getConfigDetail = createServerFn({ method: 'GET' })
  .validator((d: { slug: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const detail = await getConfigBySlug(db, data.slug)
      if (!detail) return null
      // Use the HTML highlighted at submit time when present; only fall back to live Shiki for
      // versions without it. Either way the browser gets escaped HTML, never Shiki itself.
      // resolveSourceHtml always returns a string, so this overrides the nullable ConfigDetail
      // .sourceHtml with a non-null value — the detail page can render it directly.
      const [related, stats] = await Promise.all([
        getRelatedConfigs(db, data.slug),
        getFacetStats(db),
      ])
      return {
        ...detail,
        sourceHtml: await resolveSourceHtml(detail.sourceHtml, detail.source, detail.interpreter),
        related,
        facetLabels: tagKeywords(detail.tags),
        primaryFacet: primaryFacet(detail.tags, stats),
      }
    }),
  )

export const getFacetPage = createServerFn({ method: 'GET' })
  .validator((d: { facet: string; modTags?: string[][] }) => ({
    facet: d.facet,
    modTags: coerceModTags(d.modTags),
  }))
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const stats = await getFacetStats(db, data.modTags)
      const facet = resolveLiveFacet(data.facet, stats)
      if (!facet) return null
      const cards = await getFacetCards(db, facet)
      const configs: GallerySource = {
        items: cards.map((card) => ({
          item: { kind: 'status-line', card },
          sortKey: card.copyCount,
        })),
        total: cards.length,
      }
      return {
        slug: facet.slug,
        configs,
        indexable: isIndexableFacet(facet.slug, stats),
        // Pre-formatted: a Date through the server-fn RPC boundary is the serialization
        // gamble the sitemapResponseForRoute comment above warns about; the page only
        // needs the display string anyway.
        updated: stats.get(facet.slug)?.latest?.toISOString().slice(0, 10) ?? null,
        // Other indexable facets that meet the shared threshold, for "more ways to browse".
        otherFacets: liveFacetLinks(stats, facet.slug),
      }
    }),
  )
