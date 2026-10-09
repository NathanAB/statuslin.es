import { Link } from '@tanstack/react-router'
import { FilePen } from 'lucide-react'
import type { UpdateSummary } from '@/review/my-submissions'
import { AnalyticsPrivate } from '@/ui/analytics-private'
import { Button } from '@/ui/button'
import { Row, Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { Text } from '@/ui/text'

const UPDATE_RENDER_LINE: Record<string, (versionNumber: number) => string> = {
  queued: (n) => `Update v${n} queued to render`,
  running: (n) => `Update v${n} rendering`,
  failed: (n) => `Update v${n} failed to render`,
}
const inReview = (n: number) => `Update v${n} in review`

function pendingLine(update: UpdateSummary | null): string | null {
  if (update?.status !== 'pending') return null
  return (UPDATE_RENDER_LINE[update.renderStatus] ?? inReview)(update.versionNumber)
}

/** The foot of an author's published card: where their latest update stands, then the way to
 *  submit one. A rejected update makes the button the primary action. */
export function UpdateDetails({ slug, update }: { slug: string; update: UpdateSummary | null }) {
  const line = pendingLine(update)
  const rejected = update?.status === 'rejected'
  return (
    <Stack gap={2}>
      {line ? (
        <Text muted size="sm">
          {line}
        </Text>
      ) : null}
      {rejected ? (
        <Stack gap={1}>
          <Text size="sm">Update not accepted</Text>
          {update.rejectionReason ? (
            <AnalyticsPrivate>
              <Notice tone="error">{update.rejectionReason}</Notice>
            </AnalyticsPrivate>
          ) : null}
        </Stack>
      ) : null}
      <Row gap={2} aboveOverlay>
        <Button asChild variant={rejected ? 'default' : 'outline'}>
          <Link to="/submit" search={{ update: slug }}>
            <FilePen />
            {rejected ? 'Submit a new update' : 'Submit update'}
          </Link>
        </Button>
      </Row>
    </Stack>
  )
}
