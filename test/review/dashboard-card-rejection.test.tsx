// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardRow } from '@/review/queue'

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const approveVersionFn = vi.hoisted(() => vi.fn().mockResolvedValue({ delivery: 'sent' }))
const rejectVersionFn = vi.hoisted(() => vi.fn().mockResolvedValue({ delivery: 'sent' }))
const requeueRenderJobFn = vi.hoisted(() => vi.fn())
const retryRejectionEmailFn = vi.hoisted(() => vi.fn().mockResolvedValue({ delivery: 'sent' }))
const retryApprovalEmailFn = vi.hoisted(() => vi.fn().mockResolvedValue({ delivery: 'sent' }))
const runNetworkPreviewFn = vi.hoisted(() => vi.fn())
const setReadsClaudeTokenFn = vi.hoisted(() => vi.fn())
vi.mock('@/review/decide', () => ({
  approveVersionFn,
  REJECTION_REASON_MAX: 2000,
  rejectVersionFn,
  requeueRenderJobFn,
  retryApprovalEmailFn,
  retryRejectionEmailFn,
  runNetworkPreviewFn,
  setReadsClaudeTokenFn,
}))

const { SubmissionCard } = await import('@/review/dashboard-card')

function row(
  versionStatus = 'pending',
  emailStatus: string | null = null,
  approvalEmailStatus: string | null = null,
): DashboardRow {
  return {
    config: {
      id: 'c1',
      slug: 'my-line',
      title: 'My line',
      description: '',
      interpreter: 'bash',
      status: 'draft',
      authorId: 'u1',
      author: { name: 'Test User', username: 'test', image: null },
      upvoteCount: 0,
      copyCount: 0,
      createdAt: new Date('2026-06-13T12:00:00Z'),
    },
    version: {
      id: 'v1',
      versionNumber: 1,
      source: 'echo hi',
      contentSha256: 'abc123',
      status: versionStatus,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      networkHosts: [],
      readsClaudeToken: false,
      rejectionReason: versionStatus === 'rejected' ? 'Remove the updater.' : null,
      rejectionEmailStatus: emailStatus,
      approvalEmailStatus,
    },
    renderJob: {
      status: 'done',
      attempts: 1,
      error: null,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      finishedAt: new Date('2026-06-13T12:01:00Z'),
    },
    previews: [],
  }
}

describe('SubmissionCard rejection actions', () => {
  it('reports approval and email delivery outcomes independently', async () => {
    const { unmount } = render(<SubmissionCard row={row()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Approved, published, and emailed the author.'),
    )
    unmount()

    approveVersionFn.mockResolvedValueOnce({ delivery: 'failed' })
    render(<SubmissionCard row={row()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Approved and published. Email delivery failed; retry is available.',
      ),
    )
  })

  it('directs ambiguous decision delivery to Resend reconciliation instead of retry', async () => {
    approveVersionFn.mockResolvedValueOnce({ delivery: 'ambiguous' })
    const { unmount } = render(<SubmissionCard row={row()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Approved and published. Email delivery is unconfirmed; check Resend.',
      ),
    )
    unmount()

    rejectVersionFn.mockResolvedValueOnce({ delivery: 'ambiguous' })
    render(<SubmissionCard row={row()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByLabelText('Reason for rejection'), {
      target: { value: 'Change it.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject and email author' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Rejected. Email delivery is unconfirmed; check Resend.',
      ),
    )
  })

  it('requires a reason before rejecting and emails the author on confirmation', async () => {
    render(<SubmissionCard row={row()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const confirm = screen.getByRole('button', { name: 'Reject and email author' })
    expect(screen.getByLabelText('Reason for rejection')).toBe(document.activeElement)
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Reason for rejection'), {
      target: { value: 'Remove the updater.' },
    })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(rejectVersionFn).toHaveBeenCalledWith({
        data: { versionId: 'v1', reason: 'Remove the updater.' },
      }),
    )
  })

  it('restores focus to Reject when the inline form is cancelled', () => {
    render(<SubmissionCard row={row()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Reject' })).toBe(document.activeElement)
  })

  it('offers only retry email for a rejected unsent version', async () => {
    render(<SubmissionCard row={row('rejected', 'failed')} />)

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry email' }))

    await waitFor(() =>
      expect(retryRejectionEmailFn).toHaveBeenCalledWith({ data: { versionId: 'v1' } }),
    )
  })

  it('uses an error toast when retry still cannot deliver', async () => {
    retryRejectionEmailFn.mockResolvedValueOnce({ delivery: 'failed' })
    render(<SubmissionCard row={row('rejected', 'failed')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry email' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Rejected. Email delivery failed; retry is available.',
      ),
    )
  })

  it('offers only approval-email retry for an approved unsent version', async () => {
    render(<SubmissionCard row={row('approved', null, 'failed')} />)

    expect(screen.getByText('published')).toBeTruthy()
    expect(screen.getByText('Published — live in the gallery')).toBeTruthy()
    expect(screen.queryByText('Rendered — ready to review')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry email' }))

    await waitFor(() =>
      expect(retryApprovalEmailFn).toHaveBeenCalledWith({ data: { versionId: 'v1' } }),
    )
  })

  it.each([
    'sending',
    'ambiguous',
  ])('shows %s rejection delivery for reconciliation without a retry action', (deliveryStatus) => {
    render(<SubmissionCard row={row('rejected', deliveryStatus)} />)

    expect(
      screen.getByText('Email delivery is unconfirmed. Check Resend before taking action.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry email' })).toBeNull()
  })

  it.each([
    'sending',
    'ambiguous',
  ])('shows %s approval delivery for reconciliation without a retry action', (deliveryStatus) => {
    render(<SubmissionCard row={row('approved', null, deliveryStatus)} />)

    expect(
      screen.getByText('Email delivery is unconfirmed. Check Resend before taking action.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry email' })).toBeNull()
  })
})
