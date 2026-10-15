import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import { captureServerEvent } from '@/lib/posthog-server'
import { siteUrl } from '@/lib/site'
import { buildMarketplace, marketplaceFetchedEvent } from './marketplace'
import { getMarketplaceRows, hasAnyMods } from './queries'

// createServerOnlyFn keeps `db` out of the client bundle, as for the sitemap route.
export const marketplaceResponseForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const marketplace = buildMarketplace(siteUrl(), await getMarketplaceRows(db))
  const fetched = marketplaceFetchedEvent(marketplace.plugins.length)
  captureServerEvent(fetched.event, fetched.distinctId, fetched.properties)
  // forceRemoveDeletedPlugins uninstalls anything a 200 omits. Only an empty or wrong database gets a 503,
  // which keeps clients' cached catalog; an empty list over real mods is a takedown and must reach them.
  if (marketplace.plugins.length === 0 && !(await hasAnyMods(db))) {
    return new Response(null, { status: 503 })
  }
  return Response.json(marketplace)
})
