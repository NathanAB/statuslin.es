import { siteUrl } from '@/lib/site'

/**
 * The absolute `rel="canonical"` link for a route, for use in a TanStack `head().links`.
 * Built from the one origin source (`siteUrl()`) so it's correct in local/staging/prod and
 * never drifts from the og:image / sitemap URLs. The home path maps to the bare origin so the
 * canonical never carries a redundant trailing slash.
 */
export function canonicalLink(path: string): { rel: string; href: string } {
  const base = siteUrl()
  return { rel: 'canonical', href: path === '/' ? base : `${base}${path}` }
}

/** Search state after the home route's validator has removed default values. */
export interface HomeCanonicalSearch {
  sort?: string
  tags?: string
}

export function isFilteredHomeSearch(search: HomeCanonicalSearch): boolean {
  return search.sort !== undefined || search.tags !== undefined
}

/** Search params for gallery pagination links. The default trending sort is implicit, so keeping
 * it out of the URL prevents an unfiltered page from being mistaken for a noindex sorted view. */
export function homePaginationSearch<TSort extends string>(
  page: number,
  search: { sort?: TSort; tags?: string } = {},
): { page?: number; sort?: TSort; tags?: string } {
  return {
    ...(search.sort && search.sort !== 'trending' ? { sort: search.sort } : {}),
    ...(page > 1 ? { page } : {}),
    ...(search.tags ? { tags: search.tags } : {}),
  }
}

/**
 * Canonical path for the gallery home. Preserve sort, tag, and page state so a paginated URL never
 * canonicalizes to different content. Filtered and sorted views get noindex metadata at the route
 * level; their canonical still describes the exact page whose links crawlers should follow.
 */
export function homeCanonicalPath(page: number, search: HomeCanonicalSearch = {}): string {
  const params = new URLSearchParams()
  if (search.sort !== undefined) params.set('sort', search.sort)
  if (search.tags !== undefined) params.set('tags', search.tags)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/?${query}` : '/'
}
