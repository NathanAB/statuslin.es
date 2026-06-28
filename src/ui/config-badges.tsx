import { Globe } from 'lucide-react'
import type * as React from 'react'
import { Badge } from '@/ui/badge'
import { Row } from '@/ui/layout'

/** The chip pair shown in the top-right of a gallery card and the detail page:
 *  the interpreter (always) and a `network` chip when the config declares hosts.
 *  Rendered once here so both surfaces stay identical. */
export function ConfigBadges({
  interpreter,
  usesNetwork,
}: {
  interpreter: string
  usesNetwork: boolean
}): React.ReactElement {
  return (
    <Row gap={2}>
      <Badge variant="secondary">{interpreter}</Badge>
      {usesNetwork ? (
        <Badge variant="primaryOutline">
          <Globe />
          network
        </Badge>
      ) : null}
    </Row>
  )
}
