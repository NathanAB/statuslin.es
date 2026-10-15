import { Monitor } from 'lucide-react'
import { Hint } from '@/ui/hint'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'

/** Strip on config pages pointing Claude Desktop users at statusline-anywhere. */
export function DesktopNote() {
  return (
    <Hint icon={Monitor}>
      <Text inline>Using the Claude desktop app?</Text> Add your status line with{' '}
      <StatuslineAnywhereLink surface="config_page" />.
    </Hint>
  )
}
