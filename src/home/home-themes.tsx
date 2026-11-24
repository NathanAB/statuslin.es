import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { THEMES_PATH } from '@/lib/site'
import type { HomeThemeRow } from '@/themes/queries'
import { themeCount } from '@/themes/theme'
import { ThemeCard } from '@/themes/theme-card'
import { Button } from '@/ui/button'
import { HomeSection } from '@/ui/home-section'
import { Row, Stack, WideTileGrid } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'

/**
 * Theme plugins stay out of the gallery (ADR 0012), so this row is where the home page shows themes.
 * Nothing when no theme is listed.
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
              Color themes for the terminal, and Desktop themes that recolor Claude Desktop, each
              previewed in a real session. Install one, then switch to it as its card shows.
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
