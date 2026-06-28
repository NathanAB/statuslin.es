import { requireEnv } from '@/lib/env'

/**
 * Single source of truth for public-facing site details that are the same in every
 * environment and aren't secrets — so by the DRY rule they live in code, not env vars.
 */

/** Contact + abuse-report address (live, forwarding-verified). Used by the site footer. */
export const CONTACT_EMAIL = 'hello@statuslin.es'

/** Public source repository. Linked from the site footer. */
export const REPO_URL = 'https://github.com/NathanAB/statuslin.es'

/**
 * License for user-submitted statusline configs (NOT the site's own code, which is MIT).
 * CC0 (public domain): a statusline is a tiny snippet meant to be copied and run, so we skip
 * MIT's attribution friction. Submitters grant this at submit time; the gallery shows it next
 * to the copy actions and the Terms page. Single source so the label never drifts.
 */
export const CONTENT_LICENSE = {
  name: 'CC0 1.0',
  shortLabel: 'CC0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
} as const

/**
 * Absolute site origin (e.g. https://statuslin.es), no trailing slash. Used to build absolute
 * og:image URLs, which scrapers require.
 *
 * Isomorphic on purpose: it's called from route head() functions, which run on BOTH the server
 * (SSR) and the client (during in-app navigation). The browser bundle has no BETTER_AUTH_URL, so
 * on the client we read the live origin instead. Scrapers only ever read the server-rendered HTML,
 * so the server branch stays authoritative; on the server we derive from the one origin source,
 * BETTER_AUTH_URL (see auth.ts), correct in local/staging/prod.
 */
export function siteUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return requireEnv('BETTER_AUTH_URL').replace(/\/+$/, '')
}
