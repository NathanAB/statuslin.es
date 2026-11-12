import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import {
  llmsFullTxtResponseForRoute,
  llmsTxtResponseForRoute,
  sitemapResponseForRoute,
} from '@/gallery/functions'
import { unreviewedModPath } from '@/lib/site'
import { getPublishedModListings } from './published-listings'
import { listUnreviewedMods } from './unreviewed-queries'

// createServerOnlyFn keeps `db` out of the client bundle, as for the gallery's sitemap. The gallery
// cannot query mods, so the published ones are passed in for it to count and list.
// Unreviewed mods' pages are in the sitemap but count toward nothing the gallery lists (ADR 0011).
export const sitemapWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const [listings, unreviewed] = await Promise.all([
    getPublishedModListings(db),
    listUnreviewedMods(db),
  ])
  return sitemapResponseForRoute(
    listings,
    unreviewed.map((mod) => ({
      path: unreviewedModPath(mod.owner, mod.pluginName),
      updatedAt: mod.checkedAt,
    })),
  )
})

export const llmsTxtWithModsForRoute = createServerOnlyFn(
  async (): Promise<Response> => llmsTxtResponseForRoute(await getPublishedModListings(db)),
)

export const llmsFullTxtWithModsForRoute = createServerOnlyFn(
  async (): Promise<Response> => llmsFullTxtResponseForRoute(await getPublishedModListings(db)),
)
