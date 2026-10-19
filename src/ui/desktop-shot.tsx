import { cva } from 'class-variance-authority'

/** A Claude Desktop preview image. `width` and `height` are CSS pixels; the PNG has more. */
export interface DesktopShotImage {
  src: string
  width: number
  height: number
}

// A card image is recorded to fit a card: the mod's band, its pane, or the top of its shot. It
// shows whole and at its natural size, so its text stays readable; a card narrower than it crops
// it from the right, and the 300px cap (75 spacing steps of 4px) is only a safety net.
const cardFrame = cva(
  'flex max-h-75 w-fit max-w-full flex-col overflow-hidden rounded-md border border-border',
)

/**
 * `whole` shows the entire shot, at most at its CSS width and scaled down to fit. `card` shows a
 * card image at its CSS size.
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
        data-ui=""
        src={shot.src}
        alt={alt}
        width={shot.width}
        height={shot.height}
        className="h-auto max-w-full rounded-md border border-border"
      />
    )
  }
  return (
    <div data-ui="" className={cardFrame()}>
      <img
        src={shot.src}
        alt={alt}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        className="max-w-none shrink-0"
      />
    </div>
  )
}
