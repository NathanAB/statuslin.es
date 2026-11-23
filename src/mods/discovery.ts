import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import {
  llmsFullTxtResponseForRoute,
  llmsTxtResponseForRoute,
  sitemapResponseForRoute,
} from '@/gallery/functions'
import { modPath, THEMES_PATH, unreviewedModPath } from '@/lib/site'
import { newestDate, type SitemapPage } from '@/lib/sitemap'
import { getPublishedModListings, type PublishedModListing } from './published-listings'
import { listUnreviewedMods } from './unreviewed-queries'

async function publishedListings(): Promise<{
  all: PublishedModListing[]
  mods: PublishedModListing[]
  themePlugins: PublishedModListing[]
}> {
  const all = await getPublishedModListings(db)
  return {
    all,
    mods: all.filter((listing) => !listing.themeOnly),
    themePlugins: all.filter((listing) => listing.themeOnly),
  }
}

// /themes is noindex while it has no cards.
function themesPages(all: PublishedModListing[]): SitemapPage[] {
  const updatedAt = newestDate(all.filter((l) => l.hasThemeCards).map((l) => l.updatedAt))
  return updatedAt === null ? [] : [{ path: THEMES_PATH, updatedAt }]
}

// createServerOnlyFn keeps `db` out of the client bundle, as for the gallery's sitemap. The gallery
// cannot query mods, so the published ones are passed in for it to count and list.
// Theme plugins' and unreviewed mods' pages are in the sitemap but count toward nothing the gallery
// lists (ADR 0011, ADR 0012).
export const sitemapWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const [{ all, mods, themePlugins }, unreviewed] = await Promise.all([
    publishedListings(),
    listUnreviewedMods(db),
  ])
  return sitemapResponseForRoute(mods, [
    ...themesPages(all),
    ...themePlugins.map((plugin) => ({ path: modPath(plugin.slug), updatedAt: plugin.updatedAt })),
    ...unreviewed.map((mod) => ({
      path: unreviewedModPath(mod.owner, mod.pluginName),
      updatedAt: mod.checkedAt,
    })),
  ])
})

export const llmsTxtWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const { mods, themePlugins } = await publishedListings()
  return llmsTxtResponseForRoute(mods, themePlugins)
})

export const llmsFullTxtWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const { mods, themePlugins } = await publishedListings()
  return llmsFullTxtResponseForRoute(mods, themePlugins)
})
