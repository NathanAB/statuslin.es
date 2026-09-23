import { createMiddleware } from '@tanstack/react-start'

// Mirrors the check in @tanstack/start-server-core createStartHandler: a page request whose Accept
// has neither of these prefixes gets a 500 "Only HTML requests are supported here".
const HTML_ACCEPT_PREFIXES = ['text/html', '*/*']
const PAGE_METHODS = new Set(['GET', 'HEAD'])
const NON_PAGE_PATH = /^\/(_serverFn|api)\/|\.[^/]*$/

function isPageRequestRefusingHtml(request: Request): boolean {
  if (!PAGE_METHODS.has(request.method)) return false
  if (NON_PAGE_PATH.test(new URL(request.url).pathname)) return false
  const accept = request.headers.get('Accept')
  if (accept === null) return false
  return !accept
    .split(',')
    .some((part) => HTML_ACCEPT_PREFIXES.some((prefix) => part.trim().startsWith(prefix)))
}

/** The router re-reads the Accept header from this same Request after the middleware chain. */
export const htmlAcceptMiddleware = createMiddleware().server(({ request, next }) => {
  if (isPageRequestRefusingHtml(request)) request.headers.set('Accept', 'text/html')
  return next()
})
