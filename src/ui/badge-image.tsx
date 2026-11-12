/**
 * A README badge image at its own size: 20px tall (badge-maker's flat badge) and as wide as its
 * words. `self-start` keeps a flex column from stretching it to the column's width.
 */
export function BadgeImage({ src, alt }: { src: string; alt: string }) {
  return <img data-ui="" src={src} alt={alt} height={20} className="h-5 w-auto self-start" />
}
