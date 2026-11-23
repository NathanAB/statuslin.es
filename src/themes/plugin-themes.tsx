import { WideTileGrid } from '@/ui/layout'
import type { PublishedTheme } from './queries'
import { ThemeCard } from './theme-card'

/** A plugin page's themes: a card each, without the install the page already leads with. */
export function PluginThemes({ themes }: { themes: PublishedTheme[] }) {
  return (
    <WideTileGrid>
      {themes.map((theme) => (
        <ThemeCard key={theme.id} theme={theme} />
      ))}
    </WideTileGrid>
  )
}
