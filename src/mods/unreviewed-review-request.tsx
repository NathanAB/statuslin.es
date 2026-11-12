import { usePostHog } from '@posthog/react'
import { useState } from 'react'
import { Button } from '@/ui/button'
import { Row } from '@/ui/layout'
import { Text } from '@/ui/text'

/** A visitor asking for an unreviewed mod to be reviewed: counted in PostHog, nowhere else (ADR 0011). */
export const REVIEW_REQUESTED_EVENT = 'unreviewed_mod_review_requested'

/** No sign-in and no count on the page: one event, then thanks. The status is on the page from the
 * start, so a screen reader announces the thanks when it fills. */
export function UnreviewedReviewRequest({
  owner,
  pluginName,
}: {
  owner: string
  pluginName: string
}) {
  const posthog = usePostHog()
  const [sent, setSent] = useState(false)
  return (
    <Row gap={3} wrap>
      <Button
        variant="outline"
        disabled={sent}
        onClick={() => {
          posthog.capture(REVIEW_REQUESTED_EVENT, { owner, pluginName })
          setSent(true)
        }}
      >
        {sent ? 'Requested' : 'Request a review'}
      </Button>
      <div role="status">
        {sent && <Text size="sm">Thanks. Requests decide which mods are reviewed next.</Text>}
      </div>
    </Row>
  )
}
