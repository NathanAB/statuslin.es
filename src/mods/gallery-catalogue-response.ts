import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from '@/db'
import { captureServerEvent } from '@/lib/posthog-server'
import { siteUrl } from '@/lib/site'
import { buildGalleryCatalogue, galleryFetchedEvent } from './gallery-catalogue'
import { getGalleryCatalogueMods } from './gallery-queries'

const CACHE_SECONDS = 300

// createServerOnlyFn keeps `db` out of the client bundle, as for the marketplace route.
export const galleryCatalogueResponseForRoute = createServerOnlyFn(
  async (userAgent: string | null): Promise<Response> => {
    const catalogue = buildGalleryCatalogue(
      siteUrl(),
      await getGalleryCatalogueMods(db),
      new Date(),
    )
    const fetched = galleryFetchedEvent(catalogue.mods.length, userAgent)
    captureServerEvent(fetched.event, fetched.distinctId, fetched.properties)
    // Public data that pages and tools on other origins read, so any origin may.
    return Response.json(catalogue, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        'Access-Control-Allow-Origin': '*',
      },
    })
  },
)
