import type { AnsiSegment } from '@/render/types'
import { StatuslinePreview } from '@/ui/statusline-preview'

/**
 * A single stacked-preview row on the detail page: a fixed-width scenario label
 * on the left (muted, brightening when the row is hovered) and the rendered
 * status line on the right, on its sunken strip. On a phone the label sits above it. The `group` + `group-hover` pairing is the visual
 * hover-label treatment; `title` carries the full scenario label as a tooltip.
 */
export function ScenarioRow({
  shortLabel,
  title,
  segments,
}: {
  shortLabel: string
  title: string
  segments: AnsiSegment[]
}) {
  return (
    <div className="group flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span
        className="w-24 shrink-0 text-muted-foreground text-xs transition-colors group-hover:text-foreground"
        title={title}
      >
        {shortLabel}
      </span>
      <div className="min-w-0 sm:flex-1">
        <StatuslinePreview segments={segments} look="strip" />
      </div>
    </div>
  )
}
