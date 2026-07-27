import type { DashboardRow } from '@/review/queue'
import { Row } from '@/ui/layout'
import { RetryApprovalEmailButton } from './dashboard-rejection-controls'

export function ApprovalDetails({
  version,
  showActions,
}: {
  version: DashboardRow['version']
  showActions: boolean
}) {
  if (version.status !== 'approved' || !showActions) return null
  const needsContact = ['pending', 'failed', 'unavailable'].includes(
    version.approvalEmailStatus ?? '',
  )
  return needsContact ? (
    <Row gap={2}>
      <RetryApprovalEmailButton versionId={version.id} />
    </Row>
  ) : null
}
