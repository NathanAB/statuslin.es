import { createMiddleware } from '@tanstack/react-start'

const UNEXPANDED_TEMPLATE_PATTERN = /\$\{[^}]+\}/

function decodePercentTokens(pathname: string): string {
  const decoded = pathname.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )

  return Array.from(decoded, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 ? '' : character
  }).join('')
}

/** Detect an unexpanded shell/template marker in a request pathname. Query values and request
 * bodies are intentionally out of scope: only malformed paths can trigger the router loop. */
export function hasUnexpandedTemplatePath(url: string): boolean {
  const rawPath = url.split(/[?#]/, 1)[0] ?? ''
  if (UNEXPANDED_TEMPLATE_PATTERN.test(rawPath)) return true

  try {
    const pathname = new URL(url, 'http://localhost').pathname
    return UNEXPANDED_TEMPLATE_PATTERN.test(decodePercentTokens(pathname))
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
