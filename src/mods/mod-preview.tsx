import { ScreenshotFigure } from '@/ui/screenshot-figure'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text } from '@/ui/text'
import type { ModDetail } from './queries'

// mod_versions stores only the screenshot path, so every curated screenshot must have this pixel
// size until per-image dimensions are stored; test/mods/curation.test.ts holds them to it.
export const DESKTOP_SCREENSHOT_SIZE = { width: 1828, height: 365 }

/** The terminal preview, else the Desktop screenshot that stands in for it. */
export function ModPreview({
  mod,
}: {
  mod: Pick<ModDetail, 'title' | 'preview' | 'desktopScreenshot'>
}) {
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
