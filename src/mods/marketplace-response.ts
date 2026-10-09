import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import { captureServerEvent } from '@/lib/posthog-server'
import { siteUrl } from '@/lib/site'
import { buildMarketplace, marketplaceFetchedEvent } from './marketplace'
import { getMarketplaceRows } from './queries'

// createServerOnlyFn keeps `db` out of the client bundle, as for the sitemap route.
export const marketplaceResponseForRoute = createServerOnlyFn(async (): Promise<Response> => {
  const marketplace = buildMarketplace(siteUrl(), await getMarketplaceRows(db))
  const fetched = marketplaceFetchedEvent(marketplace.plugins.length)
  captureServerEvent(fetched.event, fetched.distinctId, fetched.properties)
  // forceRemoveDeletedPlugins uninstalls anything a 200 omits; a 503 leaves clients' cached catalog intact.
  if (marketplace.plugins.length === 0) return new Response(null, { status: 503 })
  return Response.json(marketplace)
})
