import { Stack, WideTileGrid } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'
import type { UnreviewedTheme } from './queries'
import { UnreviewedThemeCard } from './unreviewed-theme-card'

/**
 * The "Not reviewed" section below a page's reviewed themes (ADR 0014), or nothing when it has
 * none. Its cards count toward nothing the page counts.
 */
export function UnreviewedThemes({ themes }: { themes: UnreviewedTheme[] }) {
  if (themes.length === 0) return null
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Heading level={2}>Not reviewed</Heading>
        <Text muted>
          Nobody at statuslin.es has read these plugins' code, so they can't be installed from here.
        </Text>
      </Stack>
      <WideTileGrid>
        {themes.map((theme) => (
          <UnreviewedThemeCard key={theme.id} theme={theme} />
        ))}
      </WideTileGrid>
    </Stack>
  )
}
