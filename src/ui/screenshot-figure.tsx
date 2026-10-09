/**
 * A captioned screenshot. The caption is the figure's direct child so it names the figure for
 * screen readers, and `width`/`height` reserve the image's box before it loads.
 */
export function ScreenshotFigure({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string
  alt: string
  caption: string
  width: number
  height: number
}) {
  return (
    <figure className="flex flex-col gap-2">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full rounded-md border border-border"
      />
      <figcaption className="text-muted-foreground text-sm">{caption}</figcaption>
    </figure>
  )
}
