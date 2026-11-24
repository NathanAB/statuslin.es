import { type AnyColumn, type SQL, sql } from 'drizzle-orm'

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

export interface PreviewImageQuery {
  /** The `r` a page names: when the shot was stored, in epoch milliseconds. */
  render: number
  image: 'card' | null
}

/**
 * A public preview image URL's query (`URL.search`), read only when it is exactly as its page
 * writes it: `?r=<digits>`, then `&image=card` where `imageAllowed`. A cache keys on the query as
 * sent, so any other spelling (another key, a key twice, padding, percent-encoding) would miss it
 * and reach the database; null tells the route to answer it with a 404 instead.
 */
export function readPreviewImageQuery(
  search: string,
  imageAllowed: boolean,
): PreviewImageQuery | null {
  const params = new URLSearchParams(search)
  const r = params.get('r')
  const image = params.get('image')
  if (r === null || !/^\d{1,15}$/.test(r)) return null
  if (image !== null && (!imageAllowed || image !== 'card')) return null
  const canonical = image === null ? `?r=${r}` : `?r=${r}&image=card`
  return search === canonical ? { render: Number(r), image } : null
}

/**
 * Selects `png` only when the row's render time is `render` (as the page writes it, in whole
 * milliseconds), else null, so a request naming any other render never reads the image bytes.
 */
export function pngIfRender(
  png: AnyColumn,
  renderedAt: AnyColumn,
  render: number,
): SQL<Uint8Array | null> {
  return sql<Uint8Array | null>`case when floor(extract(epoch from ${renderedAt}) * 1000) = ${String(render)}::numeric then ${png} end`
}
