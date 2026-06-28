import type * as React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Row } from '@/ui/layout'

/**
 * A titled content card: header with the title on the left and an optional action
 * (e.g. a Copy button) on the right, then the body. Used by the detail page's
 * Preview/Source cards and the admin review cards.
 */
export function SectionCard({
  title,
  action,
  interactive = false,
  children,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  /** Adds the gallery hover/lift treatment so a stretched-link title makes the whole card clickable. */
  interactive?: boolean
  children: React.ReactNode
}) {
  return (
    <Card interactive={interactive}>
      <CardHeader>
        <Row gap={3} justify="between">
          <CardTitle>{title}</CardTitle>
          {action}
        </Row>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
