import { ScreenshotFigure } from '@/ui/screenshot-figure'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text } from '@/ui/text'
import type { ModDetail } from './queries'

// mod_versions stores only the screenshot path, so its box is reserved at a fixed Desktop ratio.
const DESKTOP_SCREENSHOT_SIZE = { width: 1600, height: 1000 }

/** The terminal preview, else the Desktop screenshot that stands in for it. */
export function ModPreview({ mod }: { mod: ModDetail }) {
  if (mod.preview) return <StatuslinePreview segments={mod.preview} />
  if (mod.desktopScreenshot) {
    return (
      <ScreenshotFigure
        src={mod.desktopScreenshot}
        alt={`${mod.title} in Claude Desktop`}
        caption="Claude Desktop, screenshot"
        {...DESKTOP_SCREENSHOT_SIZE}
      />
    )
  }
  return (
    <Text muted size="sm">
      No preview available.
    </Text>
  )
}
