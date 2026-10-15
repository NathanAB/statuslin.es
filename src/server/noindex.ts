import { createMiddleware } from '@tanstack/react-start'

import { isFlagEnabled } from '@/lib/env'

/** Set to `true` on a deploy that must stay out of search engines (staging). Off when unset. */
export const NOINDEX_FLAG = 'NOINDEX_SITE'

const X_ROBOTS_TAG = 'noindex, nofollow'

/** Tags every response the request middleware chain produces with `X-Robots-Tag` while
 * NOINDEX_SITE is on. robots.txt stays crawlable on purpose: a crawler barred from a page never
 * fetches it, so it never sees the noindex and can still list the bare URL. */
export const noindexMiddleware = createMiddleware().server(async ({ next }) => {
  if (!isFlagEnabled(NOINDEX_FLAG)) return next()
  const result = await next()
  result.response.headers.set('X-Robots-Tag', X_ROBOTS_TAG)
  return result
})
