import { createMiddleware } from '@tanstack/react-start'
import { GUIDE_PATH, GUIDE_SUBPAGES } from '@/lib/page-title'

type CanonicalPathRule = (pathname: string) => string | null

function withoutTrailingSlash(pathname: string): string | null {
  if (pathname === '/' || !pathname.endsWith('/')) return null
  return pathname.replace(/\/+$/, '') || '/'
}

const LIVE_GUIDE_SUBPAGES = new Set(GUIDE_SUBPAGES.map((page) => page.path))

function removedGuideSubpage(pathname: string): string | null {
  if (LIVE_GUIDE_SUBPAGES.has(pathname.replace(/\/+$/, ''))) return null
  return pathname.startsWith(`${GUIDE_PATH}/`) ? GUIDE_PATH : null
}

const CANONICAL_PATH_RULES: CanonicalPathRule[] = [removedGuideSubpage, withoutTrailingSlash]

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
