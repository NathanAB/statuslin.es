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
