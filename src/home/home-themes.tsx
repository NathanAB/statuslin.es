import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { THEMES_PATH } from '@/lib/site'
import type { HomeThemeRow } from '@/themes/queries'
import { themeCount } from '@/themes/theme'
import { ThemeCard } from '@/themes/theme-card'
import { Button } from '@/ui/button'
import { HomeSection } from '@/ui/home-section'
import { InlineCommand } from '@/ui/inline-command'
import { Row, Stack, WideTileGrid } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'

/**
 * The home page's themes, after the gallery: a few theme cards, each with its install, and the way
 * to all of them on /themes. Theme plugins stay out of the gallery (ADR 0012), so this row is where
 * the home page shows them. Nothing when no theme is listed.
 */
export function HomeThemes({ row, origin }: { row: HomeThemeRow; origin: string }) {
  const headingId = useId()
  if (row.themes.length === 0) return null
  return (
    <HomeSection labelledBy={headingId}>
      <Stack gap={6}>
        <Row gap={4} justify="between" wrap>
          <Stack gap={2}>
            <Heading level={2} size="subsection" id={headingId}>
              Claude Code themes
            </Heading>
            <Text muted>
              Color themes for Claude Code in the terminal, each previewed in a real session.
              Install one, then pick it in <InlineCommand>/theme</InlineCommand>.
            </Text>
          </Stack>
          <Button asChild variant="secondary" size="pill" trailingIcon={<ArrowRight />}>
            <Link to={THEMES_PATH}>Browse all {themeCount(row.total)}</Link>
          </Button>
        </Row>
        <WideTileGrid columns={3}>
          {row.themes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} install={{ origin, surface: 'home_themes' }} />
          ))}
        </WideTileGrid>
      </Stack>
    </HomeSection>
  )
}
