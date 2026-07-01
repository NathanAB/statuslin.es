/**
 * OG card pixel size — the single source for both the image renderer (`render.ts`) and the
 * `og:image:width/height` meta (`meta.ts`). Kept in its own dependency-free module so the
 * client-reachable `meta.ts` can import the numbers without dragging resvg/satori (server-only
 * native deps in `render.ts`) into the client bundle.
 */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
