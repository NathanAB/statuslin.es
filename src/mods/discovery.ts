import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import {
  llmsFullTxtResponseForRoute,
  llmsTxtResponseForRoute,
  sitemapResponseForRoute,
} from '@/gallery/functions'
import { modPath, palettePath, THEMES_PATH, unreviewedModPath } from '@/lib/site'
import { newestDate, type SitemapPage } from '@/lib/sitemap'
import { getPalettePages } from '@/themes/queries'
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
  const [{ all, mods, themePlugins }, unreviewed, palettes] = await Promise.all([
    publishedListings(),
    listUnreviewedMods(db),
    getPalettePages(db),
  ])
  return sitemapResponseForRoute(mods, [
    ...themesPages(all),
    ...palettes.map(({ palette, updatedAt }) => ({ path: palettePath(palette.slug), updatedAt })),
    ...themePlugins.map((plugin) => ({ path: modPath(plugin.slug), updatedAt: plugin.updatedAt })),
    ...unreviewed.map((mod) => ({
      path: unreviewedModPath(mod.owner, mod.pluginName),
      updatedAt: mod.checkedAt,
    })),
  ])
})

// llms.txt lists a plugin under Themes when /themes shows it: a theme plugin, or a mod with theme
// cards. Facets still count every mod.
const carriesThemes = (listing: PublishedModListing) => listing.themeOnly || listing.hasThemeCards

// Both files link each palette page with a reviewed theme: one of unreviewed themes alone is in
// the sitemap only (ADR 0014).
const palettesWithPages = async () =>
  (await getPalettePages(db)).filter(({ reviewed }) => reviewed).map(({ palette }) => palette)

export const llmsTxtWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const [{ all, mods }, palettes] = await Promise.all([publishedListings(), palettesWithPages()])
  return llmsTxtResponseForRoute(mods, all.filter(carriesThemes), palettes)
})

export const llmsFullTxtWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const [{ all, mods }, palettes] = await Promise.all([publishedListings(), palettesWithPages()])
  return llmsFullTxtResponseForRoute(mods, all.filter(carriesThemes), palettes)
})
