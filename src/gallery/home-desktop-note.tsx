import { Monitor } from 'lucide-react'
import { Hint } from '@/ui/hint'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text, TextLink } from '@/ui/text'

/** Homepage strip pointing Claude Desktop users at statusline-anywhere and the setup guide. */
export function HomeDesktopNote() {
  return (
    <Hint icon={Monitor} variant="strip">
      <Text inline>Using the Claude desktop app?</Text> Add your status line with{' '}
      <StatuslineAnywhereLink surface="home" />.{' '}
      <TextLink to="/guide/claude-desktop">How to set it up →</TextLink>
    </Hint>
  )
}
