import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'

/** Quiet line under the install prompt: Claude Desktop needs a plugin to show this status line. */
export function DesktopNote() {
  return (
    <Text muted size="sm">
      Using Claude Desktop? It doesn't show custom status lines.{' '}
      <StatuslineAnywhereLink surface="config_page" /> adds this one above the prompt.
    </Text>
  )
}
