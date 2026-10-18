import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import {
  llmsFullTxtResponseForRoute,
  llmsTxtResponseForRoute,
  sitemapResponseForRoute,
} from '@/gallery/functions'
import { getPublishedModListings } from './published-listings'

// createServerOnlyFn keeps `db` out of the client bundle, as for the gallery's sitemap. The gallery
// cannot query mods, so the published ones are passed in for it to count and list.
export const sitemapWithModsForRoute = createServerOnlyFn(
  async (): Promise<Response> => sitemapResponseForRoute(await getPublishedModListings(db)),
)

export const llmsTxtWithModsForRoute = createServerOnlyFn(
  async (): Promise<Response> => llmsTxtResponseForRoute(await getPublishedModListings(db)),
)

export const llmsFullTxtWithModsForRoute = createServerOnlyFn(
  async (): Promise<Response> => llmsFullTxtResponseForRoute(await getPublishedModListings(db)),
)
