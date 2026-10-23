import { CUSTOMIZATION_SURFACES } from '@/resources/surfaces'
import { TileGrid } from '@/ui/layout'
import { Panel } from '@/ui/panel'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/**
 * Every way to customize Claude Code as a tile each: what it changes, then its links one per line,
 * where the site lists some first and Anthropic's docs for it last (off the site, so it says whose
 * they are). All eight are in the page from the first paint.
 */
export function CustomizationMap() {
  return (
    <TileGrid>
      {CUSTOMIZATION_SURFACES.map((surface) => (
        <Panel
          key={surface.name}
          foot={
            <>
              {surface.browse.map((link) => (
                <TextLink key={link.to} to={link.to}>
                  {link.label} <span aria-hidden="true">→</span>
                </TextLink>
              ))}
              <TextLink href={surface.docsUrl}>
                Anthropic's docs <VisuallyHidden>for {surface.name.toLowerCase()}</VisuallyHidden>{' '}
                <span aria-hidden="true">↗</span>
              </TextLink>
            </>
          }
        >
          <Heading level={3} size="compact">
            {surface.name}
          </Heading>
          <Text muted>{surface.text}</Text>
        </Panel>
      ))}
    </TileGrid>
  )
}
