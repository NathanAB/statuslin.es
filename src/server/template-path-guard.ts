import { createMiddleware } from '@tanstack/react-start'

/** Detect an unexpanded shell/template marker in a request pathname. Query values and request
 * bodies are intentionally out of scope: only malformed paths can trigger the router loop. */
export function hasUnexpandedTemplatePath(url: string): boolean {
  const rawPath = url.split(/[?#]/, 1)[0] ?? ''
  if (/\$\{[^}]+\}/.test(rawPath)) return true

  try {
    const pathname = new URL(url, 'http://localhost').pathname
    try {
      return /\$\{[^}]+\}/.test(decodeURIComponent(pathname))
    } catch {
      return false
    }
  } catch {
    return false
  }
}

/** Stop malformed template paths before the application router can normalize them into a
 * self-redirect. Normal requests continue through the request middleware chain. */
export const templatePathGuardMiddleware = createMiddleware().server(({ request, next }) => {
  if (hasUnexpandedTemplatePath(request.url)) {
    return new Response('Not Found', { status: 404 })
  }

  return next()
})
