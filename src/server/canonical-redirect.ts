import { createMiddleware } from '@tanstack/react-start'

/** A rule maps a request pathname to its canonical pathname, or null when it has no opinion. */
type CanonicalPathRule = (pathname: string) => string | null

function withoutTrailingSlash(pathname: string): string | null {
  if (pathname === '/' || !pathname.endsWith('/')) return null
  return pathname.replace(/\/+$/, '') || '/'
}

// /guide/fields was deleted 2026-07-07. Nothing lives under /guide/ any more.
function removedGuideSubpage(pathname: string): string | null {
  return pathname.startsWith('/guide/') ? '/guide' : null
}

const CANONICAL_PATH_RULES: CanonicalPathRule[] = [removedGuideSubpage, withoutTrailingSlash]

/** The canonical path + query a URL should permanently redirect to, or null when it is canonical.
 * The first matching rule wins. */
export function canonicalRedirect(url: string): string | null {
  const { pathname, search } = new URL(url)
  for (const rule of CANONICAL_PATH_RULES) {
    const canonicalPath = rule(pathname)
    if (canonicalPath !== null) return canonicalPath + search
  }
  return null
}

export const canonicalRedirectMiddleware = createMiddleware().server(({ request, next }) => {
  const location = canonicalRedirect(request.url)
  if (location !== null) {
    return new Response(null, { status: 308, headers: [['Location', location]] })
  }
  return next()
})
