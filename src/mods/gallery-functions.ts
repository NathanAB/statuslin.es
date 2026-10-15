import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { coerceSourceQuery } from '@/gallery/ranking'
import { withHttpStatus } from '@/lib/http.server'
import { FEATURED_MOD_SLUG } from './featured-mod'
import { getModSource, getPublishedModCard } from './gallery-queries'

export const getGalleryModsFn = createServerFn({ method: 'GET' })
  .inputValidator(coerceSourceQuery)
  .handler(({ data }) => withHttpStatus(() => getModSource(db, data)))

export const getPublishedModTagsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () =>
    (await getModSource(db, { sort: 'top' })).items.map(({ item }) => item.card.tags),
  ),
)

/** The home page's featured mod, or null while it isn't published. */
export const getFeaturedModFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getPublishedModCard(db, FEATURED_MOD_SLUG)),
)
