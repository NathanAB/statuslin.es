import type { AnsiSegment } from '@/render/types'
import { StatuslinePreview } from '@/ui/statusline-preview'

/**
 * A single stacked-preview row on the detail page: a fixed-width scenario label
 * on the left (muted, brightening when the row is hovered) and the rendered
 * statusline on the right. The `group` + `group-hover` pairing is the visual
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
    <div className="group flex items-center gap-3">
      <span
        className="w-24 shrink-0 text-muted-foreground text-xs transition-colors group-hover:text-foreground"
        title={title}
      >
        {shortLabel}
      </span>
      <StatuslinePreview segments={segments} />
    </div>
  )
}
