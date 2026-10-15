import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import { llmsTxtResponseForRoute, sitemapResponseForRoute } from '@/gallery/functions'
import { withModLinks } from '@/lib/llms'
import { siteUrl } from '@/lib/site'
import { withModUrls } from '@/lib/sitemap'
import { getPublishedModListings } from './queries'

// createServerOnlyFn keeps `db` out of the client bundle, as for the gallery's sitemap.
export const sitemapWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const [sitemap, mods] = await Promise.all([
    sitemapResponseForRoute(),
    getPublishedModListings(db),
  ])
  return withModUrls(sitemap, siteUrl(), mods)
})

export const llmsTxtWithModsForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const [llms, mods] = await Promise.all([llmsTxtResponseForRoute(), getPublishedModListings(db)])
  return withModLinks(llms, siteUrl(), mods)
})
