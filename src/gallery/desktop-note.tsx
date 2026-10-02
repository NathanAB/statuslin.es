import { Monitor } from 'lucide-react'
import { Hint } from '@/ui/hint'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'

/** Strip pointing Claude Desktop users at statusline-anywhere (homepage and config pages). */
export function DesktopNote({ surface }: { surface: 'home' | 'config_page' }) {
  return (
    <Hint icon={Monitor}>
      <Text inline>Using the Claude desktop app?</Text> Add your status line with{' '}
      <StatuslineAnywhereLink surface={surface} />.
    </Hint>
  )
}
