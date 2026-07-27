import type { DashboardRow } from '@/review/queue'
import { AnalyticsPrivate } from '@/ui/analytics-private'
import { Row, Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { Text, TextLink } from '@/ui/text'
import { RetryRejectionEmailButton } from './dashboard-rejection-controls'

export function RejectionDetails({
  version,
  slug,
  showActions,
}: {
  version: DashboardRow['version']
  slug: string
  showActions: boolean
}) {
  if (version.status !== 'rejected') return null
  const needsContact = ['pending', 'failed', 'unavailable'].includes(
    version.rejectionEmailStatus ?? '',
  )
  return (
    <>
      {version.rejectionReason ? (
        <AnalyticsPrivate>
          <Stack gap={1}>
            <Text size="sm">Reviewer reason</Text>
            <Notice tone="error">{version.rejectionReason}</Notice>
          </Stack>
        </AnalyticsPrivate>
      ) : null}
      {!showActions ? (
        <TextLink to="/submit" search={{ resubmit: slug }}>
          Fix and resubmit
        </TextLink>
      ) : null}
      {showActions && needsContact ? (
        <Row gap={2}>
          <RetryRejectionEmailButton versionId={version.id} />
        </Row>
      ) : null}
    </>
  )
}
