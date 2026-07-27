import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  type ApprovalEmailStatus,
  approveVersionFn,
  REJECTION_REASON_MAX,
  type RejectionEmailStatus,
  rejectVersionFn,
  retryApprovalEmailFn,
  retryRejectionEmailFn,
} from '@/review/decide'
import { Button } from '@/ui/button'
import { Label } from '@/ui/label'
import { Row, Stack } from '@/ui/layout'
import { Textarea } from '@/ui/textarea'

function deliveryMessage(delivery: RejectionEmailStatus, retry: boolean): string {
  if (delivery === 'sent') return retry ? 'Email sent.' : 'Rejected and emailed the author.'
  if (delivery === 'unavailable') return 'Rejected. The author has no verified email.'
  if (delivery === 'ambiguous' || delivery === 'sending') {
    return 'Rejected. Email delivery is unconfirmed; check Resend.'
  }
  return 'Rejected. Email delivery failed; retry is available.'
}

function showDeliveryToast(delivery: RejectionEmailStatus, retry: boolean) {
  const message = deliveryMessage(delivery, retry)
  if (delivery === 'sent') toast.success(message)
  else toast.error(message)
}

function approvalDeliveryMessage(delivery: ApprovalEmailStatus, retry: boolean): string {
  if (delivery === 'sent') {
    return retry ? 'Email sent.' : 'Approved, published, and emailed the author.'
  }
  if (delivery === 'unavailable') {
    return 'Approved and published. The author has no verified email.'
  }
  if (delivery === 'ambiguous' || delivery === 'sending') {
    return 'Approved and published. Email delivery is unconfirmed; check Resend.'
  }
  return 'Approved and published. Email delivery failed; retry is available.'
}

function showApprovalDeliveryToast(delivery: ApprovalEmailStatus, retry: boolean) {
  const message = approvalDeliveryMessage(delivery, retry)
  if (delivery === 'sent') toast.success(message)
  else toast.error(message)
}

export function ReviewDecisionControls({ versionId }: { versionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const reasonId = `rejection-reason-${versionId}`
  const rejectButtonId = `reject-version-${versionId}`
  const restoreRejectFocus = useRef(false)

  useEffect(() => {
    if (rejecting) {
      document.getElementById(reasonId)?.focus()
    } else if (restoreRejectFocus.current) {
      restoreRejectFocus.current = false
      document.getElementById(rejectButtonId)?.focus()
    }
  }, [reasonId, rejectButtonId, rejecting])

  async function approve() {
    if (pending) return
    setPending(true)
    try {
      const result = await approveVersionFn({ data: { versionId } })
      showApprovalDeliveryToast(result.delivery, false)
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve.')
    } finally {
      setPending(false)
    }
  }

  async function reject() {
    if (pending || !trimmedReason || trimmedReason.length > REJECTION_REASON_MAX) return
    setPending(true)
    try {
      const result = await rejectVersionFn({ data: { versionId, reason: trimmedReason } })
      showDeliveryToast(result.delivery, false)
      setRejecting(false)
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject.')
    } finally {
      setPending(false)
    }
  }

  if (!rejecting) {
    return (
      <Row gap={2}>
        <Button type="button" onClick={approve} disabled={pending}>
          Approve
        </Button>
        <Button
          id={rejectButtonId}
          type="button"
          variant="destructive"
          onClick={() => setRejecting(true)}
          disabled={pending}
        >
          Reject
        </Button>
      </Row>
    )
  }

  return (
    <Stack gap={2}>
      <Label htmlFor={reasonId}>Reason for rejection</Label>
      <Textarea
        id={reasonId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={REJECTION_REASON_MAX}
        required
      />
      <Row gap={2}>
        <Button
          type="button"
          variant="destructive"
          onClick={reject}
          disabled={
            pending || trimmedReason.length === 0 || trimmedReason.length > REJECTION_REASON_MAX
          }
        >
          {pending ? 'Rejecting…' : 'Reject and email author'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            restoreRejectFocus.current = true
            setRejecting(false)
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </Row>
    </Stack>
  )
}

export function RetryRejectionEmailButton({ versionId }: { versionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function retry() {
    if (pending) return
    setPending(true)
    try {
      const result = await retryRejectionEmailFn({ data: { versionId } })
      showDeliveryToast(result.delivery, true)
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not retry email.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button type="button" onClick={retry} disabled={pending}>
      {pending ? 'Sending…' : 'Retry email'}
    </Button>
  )
}

export function RetryApprovalEmailButton({ versionId }: { versionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function retry() {
    if (pending) return
    setPending(true)
    try {
      const result = await retryApprovalEmailFn({ data: { versionId } })
      showApprovalDeliveryToast(result.delivery, true)
      await router.invalidate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not retry email.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button type="button" onClick={retry} disabled={pending}>
      {pending ? 'Sending…' : 'Retry email'}
    </Button>
  )
}
