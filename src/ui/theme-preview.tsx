import type { AnsiSegment } from '@/render/types'
import type { ThemeWindow } from '@/themes/theme'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { FOCUS_RING } from '@/ui/focus-ring'
import { Fitted } from '@/ui/terminal'
import { VisuallyHidden } from '@/ui/visually-hidden'

// Text the theme leaves in the terminal's default colors takes the window's, so a light theme sits
// in a light window (the site's colors swapped) and a dark one in the dark well, as each would in a
// terminal made for it.
const WINDOW: Record<ThemeWindow, string> = {
  light: 'bg-foreground text-background',
  dark: 'bg-sunken text-foreground',
}

// The whole screen fits the card's width: a monospace character is about 0.6em wide, so the text
// shrinks until `--cols` characters span 100cqw, at most 14px. A preview is a picture of colors, so it
// has no floor: on a narrow phone the whole screen still fits, smaller than reading text. Rows at
// 1.3em touch, so row backgrounds don't seam.
const FIT_WHOLE_SCREEN =
  'text-[length:min(0.875rem,calc(100cqw/(var(--cols,1)*0.6)))] leading-[1.3]'

/**
 * A terminal theme's recorded screen in the window it was made for. One image to a screen reader,
 * named by `label`; the screen's text is the recording's, never markup.
 */
export function ThemePreview({
  segments,
  window,
  label,
}: {
  segments: AnsiSegment[]
  window: ThemeWindow
  label: string
}) {
  return (
    <div
      data-ui=""
      role="img"
      aria-label={label}
      className={`@container overflow-hidden rounded-md p-3 ${WINDOW[window]}`}
    >
      <Fitted segments={segments} fit={FIT_WHOLE_SCREEN} />
    </div>
  )
}

/**
 * A Desktop theme's whole Claude Desktop window, scaled to the card's width and fetched only as it
 * nears the screen, so a page of many themes loads the ones in view. It links to `fullSize`, the
 * window at its recorded size. The pixels are the recording's, named by `label`.
 */
export function DesktopThemePreview({
  card,
  fullSize,
  label,
}: {
  card: DesktopShotImage
  fullSize: string
  label: string
}) {
  return (
    <a data-ui="" href={fullSize} className={`block rounded-md ${FOCUS_RING}`}>
      <img
        src={card.src}
        alt={label}
        width={card.width}
        height={card.height}
        loading="lazy"
        className="border-border h-auto w-full rounded-md border"
      />
      <VisuallyHidden>(full size)</VisuallyHidden>
    </a>
  )
}
