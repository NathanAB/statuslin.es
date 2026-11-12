/**
 * A listing's share card, shown small. `width` and `height` are the card's pixel size, so the
 * page keeps its place while the image loads; `self-start` keeps a flex column from stretching it.
 */
export function ShareCardImage({
  src,
  alt,
  width,
  height,
}: {
  src: string
  alt: string
  width: number
  height: number
}) {
  return (
    <img
      data-ui=""
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className="h-auto w-full max-w-sm self-start rounded-md border border-border"
    />
  )
}
