import { DesktopShot } from '@/ui/desktop-shot'
import { Stack } from '@/ui/layout'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'
import type { ConfigDesktopPreview } from './desktop-preview'

/** A status line page's Claude Desktop preview, under its terminal rows, naming the plugin that drew it. */
export function DesktopPreviewBlock({
  desktop,
  title,
}: {
  desktop: ConfigDesktopPreview
  title: string
}) {
  return (
    <Stack gap={1.5}>
      <Text muted size="xs">
        In Claude Desktop
      </Text>
      {desktop.kind === 'shot' ? (
        <DesktopShot shot={desktop.shot} alt={`${title} in Claude Desktop`} fit="whole" />
      ) : (
        <Text muted size="sm">
          Draws nothing in Claude Desktop.
        </Text>
      )}
      <Text muted size="sm">
        Recorded with <StatuslineAnywhereLink surface="config_page" />.
      </Text>
    </Stack>
  )
}
