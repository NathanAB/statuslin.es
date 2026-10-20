import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { facetTopics, getFacetStats } from './facet-queries'
import { coerceModTags } from './functions'

/**
 * The /status-lines hub's topics: every indexable facet page with its status line and mod counts.
 * src/gallery cannot query mods, so the caller passes each published mod's tags, as the facet
 * pages' caller does.
 */
export const getFacetHub = createServerFn({ method: 'GET' })
  .validator((d: { modTags?: string[][] }) => coerceModTags(d.modTags))
  .handler(({ data }) =>
    withHttpStatus(async () => facetTopics(await getFacetStats(db, data), data)),
  )
