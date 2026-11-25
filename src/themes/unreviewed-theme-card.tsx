import { Palette } from 'lucide-react'
import { UNREVIEWED_MOD_ROUTE } from '@/lib/site'
import { Badge } from '@/ui/badge'
import { Card, CardContent } from '@/ui/card'
import { Hint } from '@/ui/hint'
import { Row, Stack } from '@/ui/layout'
import { SectionAnchor } from '@/ui/page-section'
import { Heading, Text, TextLink } from '@/ui/text'
import { unreviewedThemeAnchor } from './palettes'
import type { UnreviewedTheme } from './queries'
import { TERMINAL_COLORS_NOTICE, THEME_KIND_LABEL, THEME_WINDOW_LABEL } from './theme'
import { ThemeLook } from './theme-card'

/**
 * A theme of a mod nobody here has reviewed (ADR 0014): its preview, its name, a "Not reviewed"
 * label and, unless `onModPage`, its mod's page. No install and no switch steps, which are for an
 * installed plugin. The name, plugin name and owner are the author's text, shown only as text.
 */
export function UnreviewedThemeCard({
  theme,
  onModPage = false,
}: {
  theme: UnreviewedTheme
  onModPage?: boolean
}) {
  const anchor = unreviewedThemeAnchor(theme)
  const { owner, pluginName } = theme.mod
  return (
    <SectionAnchor id={anchor}>
      <Card>
        <CardContent>
          <Stack gap={3}>
            <ThemeLook theme={theme} />
            <Row gap={2} justify="between">
              <Heading level={3}>
                <TextLink href={`#${anchor}`} tone="plain">
                  {theme.name}
                </TextLink>
              </Heading>
              <Row gap={2} wrap>
                <Badge variant="outline">Not reviewed</Badge>
                <Badge variant="outline">{THEME_KIND_LABEL[theme.kind]}</Badge>
                <Badge variant="outline">{THEME_WINDOW_LABEL[theme.window]}</Badge>
              </Row>
            </Row>
            {theme.kind === 'terminal' && theme.usesTerminalColors ? (
              <Hint icon={Palette}>{TERMINAL_COLORS_NOTICE}</Hint>
            ) : null}
            {onModPage ? null : (
              <Text size="sm">
                From{' '}
                <TextLink to={UNREVIEWED_MOD_ROUTE} params={{ owner, pluginName }}>
                  {pluginName}
                </TextLink>{' '}
                by <Text inline>{owner}</Text>
              </Text>
            )}
          </Stack>
        </CardContent>
      </Card>
    </SectionAnchor>
  )
}
