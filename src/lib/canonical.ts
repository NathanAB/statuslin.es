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

/**
 * Canonical path for the gallery home. Sort and tag filters are browsing controls, not separate
 * SEO pages, so every filtered/sorted URL points at the bare gallery. Unfiltered deeper pages
 * self-canonical so their configs stay discoverable (canonicaling page 2+ to page 1 told Google
 * they were duplicates).
 */
export function homeCanonicalPath(page: number, search: HomeCanonicalSearch = {}): string {
  if (search.sort !== undefined || search.tags !== undefined) return '/'
  return page > 1 ? `/?page=${page}` : '/'
}
