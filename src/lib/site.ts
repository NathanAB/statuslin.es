import { requireEnv } from '@/lib/env'

/**
 * Single source of truth for public-facing site details that are the same in every
 * environment and aren't secrets — so by the DRY rule they live in code, not env vars.
 */

/** The site's name, as search results and share cards show it. */
export const SITE_NAME = 'statuslin.es'

/** The square 180x180 brand icon: the iOS home-screen icon and the Organization logo. */
export const BRAND_ICON_PATH = '/apple-touch-icon.png'

/** Contact + abuse-report address (live, forwarding-verified). Used by the site footer. */
export const CONTACT_EMAIL = 'hello@statuslin.es'

/** Public source repository. Linked from the site footer and the header's GitHub link. */
export const REPO_URL = 'https://github.com/NathanAB/statuslin.es'

/** How to report a security hole: the repository's policy. */
export const SECURITY_POLICY_URL = `${REPO_URL}/blob/main/SECURITY.md`

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

export const MODS_PATH = '/mods'

export const MOD_ROUTE = '/mods/$slug'

export function modPath(slug: string): string {
  return MOD_ROUTE.replace('$slug', () => slug)
}

/** A mod version's Claude Desktop preview image. */
export const MOD_DESKTOP_PREVIEW_ROUTE = '/mod-previews/$versionId/desktop.png'

/** Names the render too, so a re-render is a new URL that no cache has seen. */
/** A version's Desktop shot, or with `image` 'card' its card image, under the render that made it. */
export function modDesktopPreviewPath(
  versionId: string,
  renderedAt: Date,
  image: 'shot' | 'card' = 'shot',
): string {
  const path = `${MOD_DESKTOP_PREVIEW_ROUTE.replace('$versionId', () => versionId)}?r=${renderedAt.getTime()}`
  return image === 'card' ? `${path}&image=card` : path
}

/** A status line version's Claude Desktop preview image. */
export const CONFIG_DESKTOP_PREVIEW_ROUTE = '/config-previews/$versionId/desktop.png'

/** A status line version's Desktop shot, under the recording that made it, as for mods. */
export function configDesktopPreviewPath(versionId: string, renderedAt: Date): string {
  return `${CONFIG_DESKTOP_PREVIEW_ROUTE.replace('$versionId', () => versionId)}?r=${renderedAt.getTime()}`
}

export const MARKETPLACE_PATH = '/marketplace.json'

/** The full plain-markdown catalog that /llms.txt links (see llmstxt.org). */
export const LLMS_FULL_PATH = '/llms-full.txt'
