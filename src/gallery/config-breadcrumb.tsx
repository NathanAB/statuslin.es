import { HOME_CRUMB_NAME } from '@/lib/json-ld'
import { Row } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'

function Separator() {
  return (
    <Text muted size="sm" inline>
      ›
    </Text>
  )
}

/** The visible trail matching the config page's BreadcrumbList JSON-LD. */
export function ConfigBreadcrumb({
  title,
  primaryFacet,
}: {
  title: string
  primaryFacet: { slug: string; heading: string } | null
}) {
  return (
    <nav aria-label="Breadcrumb">
      <Row gap={1.5} wrap>
        <TextLink to="/" size="sm">
          {HOME_CRUMB_NAME}
        </TextLink>
        <Separator />
        {primaryFacet && (
          <>
            <TextLink to="/status-lines/$facet" params={{ facet: primaryFacet.slug }} size="sm">
              {primaryFacet.heading}
            </TextLink>
            <Separator />
          </>
        )}
        <Text muted size="sm" inline>
          {title}
        </Text>
      </Row>
    </nav>
  )
}
