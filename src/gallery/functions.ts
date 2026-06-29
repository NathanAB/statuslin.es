import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { resolveSourceHtml } from '@/lib/highlight'
import { withHttpStatus } from '@/lib/http.server'
import { siteUrl } from '@/lib/site'
import { sitemapResponse } from '@/lib/sitemap'
import {
  coerceSort,
  type GallerySort,
  getConfigBySlug,
  getPublishedConfigs,
  getPublishedCount,
  getPublishedSlugsForSitemap,
  PAGE_SIZE,
} from './queries'

/**
 * The `/sitemap.xml` response. Lives here (not in the route file) because route files can't import
 * the db client directly — they reach gallery data through this module, the same way the og image
 * routes call into `@/og/routes`. Keeps `createdAt` a real `Date` by avoiding the server-fn RPC
 * boundary that would serialize it to a string.
 */
export async function sitemapResponseForRoute(): Promise<Response> {
  return sitemapResponse(siteUrl(), await getPublishedSlugsForSitemap(db))
}

export const getGallery = createServerFn({ method: 'GET' })
  .inputValidator((d: { sort?: GallerySort; page?: number }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const sort = coerceSort(data.sort)
      const total = await getPublishedCount(db)
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
      // Clamp so a stale ?page= past the end still lands on the last real page.
      const page = Math.min(Math.max(1, data.page ?? 1), pageCount)
      return { cards: await getPublishedConfigs(db, sort, page), page, pageCount }
    }),
  )

export const getConfigDetail = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      const userId = session?.user?.id
      const detail = await getConfigBySlug(db, data.slug, userId)
      if (!detail) return null
      // Use the HTML highlighted at submit time when present; only fall back to live Shiki for
      // versions without it. Either way the browser gets escaped HTML, never Shiki itself.
      // resolveSourceHtml always returns a string, so this overrides the nullable ConfigDetail
      // .sourceHtml with a non-null value — the detail page can render it directly.
      return {
        ...detail,
        sourceHtml: await resolveSourceHtml(detail.sourceHtml, detail.source, detail.interpreter),
      }
    }),
  )
