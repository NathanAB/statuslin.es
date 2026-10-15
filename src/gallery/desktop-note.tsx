import { Monitor } from 'lucide-react'
import { Hint } from '@/ui/hint'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'

/** Strip on config pages pointing Claude Desktop users at statusline-anywhere. */
export function DesktopNote() {
  return (
    <Hint icon={Monitor}>
      <Text inline>In Claude Desktop?</Text> Add this status line with{' '}
      <StatuslineAnywhereLink surface="config_page" />.
    </Hint>
  )
}
