/**
 * The headers every preview image response sends, public or admin. The bytes are untrusted pixels:
 * nosniff keeps a browser reading them as a PNG, and the CSP keeps them from running as a page
 * when one is opened on its own.
 */
const PREVIEW_IMAGE_HEADERS = {
  'Content-Type': 'image/png',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
}

export function previewImageResponse(png: Uint8Array, cacheControl: string): Response {
  return new Response(new Blob([png as BufferSource]), {
    headers: { ...PREVIEW_IMAGE_HEADERS, 'Cache-Control': cacheControl },
  })
}

/**
 * Whether a public preview image URL's query is one its page writes: each of `allowed` at most
 * once, and nothing else. A cache keys on the whole query, so any other query would miss it and
 * reach the database; the route answers it with a 404 instead.
 */
export function isPreviewImageQuery(query: URLSearchParams, allowed: readonly string[]): boolean {
  const keys = [...query.keys()]
  return keys.every((key) => allowed.includes(key)) && new Set(keys).size === keys.length
}
