import { Monitor } from 'lucide-react'
import { Hint } from '@/ui/hint'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'

/** Note under the install prompt: Claude Desktop needs a plugin to show this status line. */
export function DesktopNote() {
  return (
    <Hint icon={Monitor} variant="panel">
      <Text inline>Using Claude Desktop?</Text> It doesn't show custom status lines.{' '}
      <StatuslineAnywhereLink surface="config_page" /> adds this one above the prompt.
    </Hint>
  )
}
