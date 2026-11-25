/** For a response whose URL changes whenever its bytes do: a cache keeps it for good. */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

/**
 * For a public preview image: its URL changes with each render, so a browser keeps it for good,
 * but a shared cache (Cloudflare) keeps it an hour, so a removed or delisted item's image leaves
 * the edge soon after its page does.
 */
export const PREVIEW_IMAGE_CACHE = `${IMMUTABLE_CACHE}, s-maxage=3600`
