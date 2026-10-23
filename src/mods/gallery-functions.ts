import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { coerceSourceQuery } from '@/gallery/ranking'
import { type GallerySearchText, gallerySearchText } from '@/gallery/search'
import { withHttpStatus } from '@/lib/http.server'
import { getModSource } from './gallery-queries'
import { getPublishedModListings } from './published-listings'

export const getGalleryModsFn = createServerFn({ method: 'GET' })
  .validator(coerceSourceQuery)
  .handler(({ data }) => withHttpStatus(() => getModSource(db, data)))

export const getPublishedModTagsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () =>
    (await getModSource(db, { sort: 'top' })).items.map(({ item }) => item.card.tags),
  ),
)

/** Every published mod's search text, for the home gallery's search. */
export const getModSearchTextsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(
    async (): Promise<GallerySearchText[]> =>
      (await getPublishedModListings(db)).map((row) => ({
        slug: row.slug,
        searchText: gallerySearchText({
          ...row,
          author: row.authorGithub,
          copy: row.generatedContent,
        }),
      })),
  ),
)
