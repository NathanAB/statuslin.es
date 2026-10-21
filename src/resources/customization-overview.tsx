import { Fragment } from 'react'
import { CUSTOMIZATION_SURFACES } from '@/resources/data'
import { Stack } from '@/ui/layout'
import { MetaList } from '@/ui/meta-list'
import { Heading, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/**
 * The top of /resources: every way to customize Claude Code, one line each, with what it changes,
 * Anthropic's docs for it, and where the site has some to browse.
 */
export function CustomizationOverview() {
  return (
    <Stack gap={3}>
      <Heading level={2}>What you can customize</Heading>
      <MetaList
        items={CUSTOMIZATION_SURFACES.map((surface) => ({
          label: surface.name,
          value: (
            <>
              {surface.text}{' '}
              <TextLink href={surface.docsUrl}>
                Docs <VisuallyHidden>for {surface.name.toLowerCase()}</VisuallyHidden>
              </TextLink>
              {surface.browse.map((link) => (
                <Fragment key={link.to}>
                  {' · '}
                  <TextLink to={link.to}>{link.label}</TextLink>
                </Fragment>
              ))}
            </>
          ),
        }))}
      />
    </Stack>
  )
}
