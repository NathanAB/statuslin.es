import type { DashboardRow } from '@/review/queue'
import { Row } from '@/ui/layout'
import { Notice } from '@/ui/notice'
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
  if (['sending', 'ambiguous'].includes(version.approvalEmailStatus ?? '')) {
    return (
      <Notice tone="error">
        Email delivery is unconfirmed. Check Resend before taking action.
      </Notice>
    )
  }
  return needsContact ? (
    <Row gap={2}>
      <RetryApprovalEmailButton versionId={version.id} />
    </Row>
  ) : null
}
