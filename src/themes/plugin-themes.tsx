import { THEMES_PATH } from '@/lib/site'
import { Stack, WideTileGrid } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'
import type { PublishedTheme } from './queries'
import { ThemeCard } from './theme-card'

/**
 * A plugin page's themes: a card each, without the install the page already leads with, then a
 * link on to every other plugin's themes.
 */
export function PluginThemes({ themes }: { themes: PublishedTheme[] }) {
  return (
    <Stack gap={4}>
      <WideTileGrid>
        {themes.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} />
        ))}
      </WideTileGrid>
      <Text muted size="sm">
        See <TextLink to={THEMES_PATH}>every Claude Code and Claude Desktop theme</TextLink>, from
        every plugin.
      </Text>
    </Stack>
  )
}
