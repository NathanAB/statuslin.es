import { usePostHog } from '@posthog/react'
import { useState } from 'react'
import { Button } from '@/ui/button'
import { Text } from '@/ui/text'

/** A visitor asking for an unreviewed mod to be reviewed: counted in PostHog, nowhere else (ADR 0011). */
export const REVIEW_REQUESTED_EVENT = 'unreviewed_mod_review_requested'

/** No sign-in and no count on the page: one event, then thanks. */
export function UnreviewedReviewRequest({
  owner,
  pluginName,
}: {
  owner: string
  pluginName: string
}) {
  const posthog = usePostHog()
  const [sent, setSent] = useState(false)
  if (sent) {
    return (
      <div role="status">
        <Text size="sm">Thanks. Requests decide which mods are reviewed next.</Text>
      </div>
    )
  }
  return (
    <Button
      variant="outline"
      onClick={() => {
        posthog.capture(REVIEW_REQUESTED_EVENT, { owner, pluginName })
        setSent(true)
      }}
    >
      Request a review
    </Button>
  )
}
