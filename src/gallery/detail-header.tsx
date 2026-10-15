import type * as React from 'react'
import { type Crumb, DetailBreadcrumb } from '@/gallery/detail-breadcrumb'
import { type Byline, DetailByline, hasBylineFacts } from '@/gallery/detail-byline'
import { Row, Stack } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'

/**
 * The top of a status line or mod page: the breadcrumb, the title with its chips, an optional
 * subtitle, the byline, then the description.
 */
export function DetailHeader({
  trail,
  title,
  subtitle,
  chips,
  byline,
  description,
}: {
  trail: Crumb[]
  title: string
  /** One line under the title naming what the page's item does. */
  subtitle?: string | null
  chips?: React.ReactNode
  byline: Byline
  description: string | null
}) {
  return (
    <Stack gap={3}>
      <DetailBreadcrumb trail={trail} title={title} />
      <Row gap={3} wrap justify="between">
        <Heading level={1}>{title}</Heading>
        {chips}
      </Row>
      {subtitle && <Text muted>{subtitle}</Text>}
      {(hasBylineFacts(byline) || description) && (
        <Stack gap={2}>
          <DetailByline {...byline} />
          {description && (
            <Text muted size="sm">
              {description}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  )
}
