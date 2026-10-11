import type { LinkProps } from '@tanstack/react-router'
import { HOME_CRUMB_NAME } from '@/lib/breadcrumb-json-ld'
import { Row } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'

/** A linked step between home and the page itself, such as a facet page or the mods gallery. */
export interface Crumb {
  name: string
  to: NonNullable<LinkProps['to']>
  params?: LinkProps['params']
  search?: LinkProps['search']
}

function Separator() {
  return (
    <Text muted size="sm" inline>
      ›
    </Text>
  )
}

/** Home, then each crumb in `trail`, then the page's own unlinked title. */
export function DetailBreadcrumb({ trail, title }: { trail: Crumb[]; title: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <Row gap={1.5} wrap>
        <TextLink to="/" size="sm">
          {HOME_CRUMB_NAME}
        </TextLink>
        <Separator />
        {trail.map(({ name, ...link }) => (
          <Row key={name} gap={1.5}>
            <TextLink {...link} size="sm">
              {name}
            </TextLink>
            <Separator />
          </Row>
        ))}
        <Text muted size="sm" inline>
          {title}
        </Text>
      </Row>
    </nav>
  )
}
