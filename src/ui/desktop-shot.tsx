import { cva } from 'class-variance-authority'

/** A Claude Desktop preview image. `width` and `height` are CSS pixels; the PNG has more. */
export interface DesktopShotImage {
  src: string
  width: number
  height: number
  /** Which end a fixed-height card keeps. */
  cardAnchor: 'top' | 'bottom'
}

// A card crops instead of shrinking, so the text in the shot stays readable at its natural size.
const cardFrame = cva('flex max-h-37.5 flex-col overflow-hidden rounded-md border border-border', {
  variants: { anchor: { top: 'justify-start', bottom: 'justify-end' } },
})

/**
 * `whole` shows the entire shot, at most at its CSS width and scaled down to fit. `card` keeps it at
 * its CSS size and crops it to a fixed height, keeping the end the recorder anchored.
 */
export function DesktopShot({
  shot,
  alt,
  fit,
}: {
  shot: DesktopShotImage
  alt: string
  fit: 'whole' | 'card'
}) {
  if (fit === 'whole') {
    return (
      <img
        src={shot.src}
        alt={alt}
        width={shot.width}
        height={shot.height}
        className="h-auto max-w-full rounded-md border border-border"
      />
    )
  }
  return (
    <div className={cardFrame({ anchor: shot.cardAnchor })}>
      <img
        src={shot.src}
        alt={alt}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        className="max-w-none shrink-0 self-start"
      />
    </div>
  )
}
