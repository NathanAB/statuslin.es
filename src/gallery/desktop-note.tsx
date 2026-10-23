import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Text } from '@/ui/text'

/**
 * One quiet line under a status line's install button pointing Claude Desktop users at
 * statusline-anywhere. Not a filled strip: it's a side note, and shouldn't pull the eye from
 * the install button and its facts.
 */
export function DesktopNote() {
  return (
    <Text muted size="sm">
      In Claude Desktop? This status line shows there once you also install{' '}
      <StatuslineAnywhereLink surface="config_page" />.
    </Text>
  )
}
