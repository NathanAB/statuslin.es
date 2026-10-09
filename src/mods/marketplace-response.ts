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
  return Response.json(marketplace)
})
