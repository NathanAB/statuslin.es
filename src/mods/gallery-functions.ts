import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { coerceSourceQuery } from '@/gallery/ranking'
import { withHttpStatus } from '@/lib/http.server'
import { getModSource } from './gallery-queries'

export const getGalleryModsFn = createServerFn({ method: 'GET' })
  .inputValidator(coerceSourceQuery)
  .handler(({ data }) => withHttpStatus(() => getModSource(db, data)))

/** Each published mod's tags, for the gallery's tag filter and facet counts. */
export const getPublishedModTagsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () =>
    (await getModSource(db, { sort: 'top' })).items.map(({ item }) => item.card.tags),
  ),
)
