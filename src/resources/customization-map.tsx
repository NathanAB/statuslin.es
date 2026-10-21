import { CUSTOMIZATION_SURFACES } from '@/resources/surfaces'
import { Row, TileGrid } from '@/ui/layout'
import { Panel } from '@/ui/panel'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/**
 * Every way to customize Claude Code as a tile each: what it changes, Anthropic's docs for it, and
 * where the site lists some. All eight are in the page from the first paint.
 */
export function CustomizationMap() {
  return (
    <TileGrid>
      {CUSTOMIZATION_SURFACES.map((surface) => (
        <Panel key={surface.name}>
          <Heading level={3} size="compact">
            {surface.name}
          </Heading>
          <Text muted>{surface.text}</Text>
          <Row gap={3} wrap>
            <TextLink href={surface.docsUrl}>
              Docs <VisuallyHidden>for {surface.name.toLowerCase()}</VisuallyHidden>
            </TextLink>
            {surface.browse.map((link) => (
              <TextLink key={link.to} to={link.to}>
                {link.label}
              </TextLink>
            ))}
          </Row>
        </Panel>
      ))}
    </TileGrid>
  )
}
