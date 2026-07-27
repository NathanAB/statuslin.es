import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendApprovalEmail } from '@/review/approval-email'

const originalSiteUrl = process.env.BETTER_AUTH_URL

beforeEach(() => {
  process.env.BETTER_AUTH_URL = 'https://statuslin.es'
})

afterEach(() => {
  process.env.BETTER_AUTH_URL = originalSiteUrl
})

describe('sendApprovalEmail', () => {
  it('links the published status line with fixed headers and a version idempotency key', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email_approved' }, error: null })

    const result = await sendApprovalEmail(
      {
        versionId: 'version-2',
        authorName: 'Ada',
        authorEmail: 'ada@example.com',
        title: 'Ada status line',
        slug: 'ada-status-line',
      },
      send,
    )

    expect(result).toEqual({ id: 'email_approved' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'statuslin.es reviews <reviews@statuslin.es>',
        to: 'ada@example.com',
        replyTo: 'hello@statuslin.es',
        subject: 'Your statuslin.es submission was approved',
        text: expect.stringContaining(
          'Your status line submission “Ada status line” was approved.',
        ),
      }),
      { idempotencyKey: 'approval/version-2' },
    )
    const sentPayload = send.mock.calls[0]?.[0]
    expect(sentPayload).not.toHaveProperty('html')
    const message = sentPayload.text
    expect(message).toContain('https://statuslin.es/c/ada-status-line')
    expect(message).toContain('https://statuslin.es/me')
  })

  it('throws a sanitized error when Resend returns an error result', async () => {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'ada@example.com is invalid',
        statusCode: 422,
      },
    })

    await expect(
      sendApprovalEmail(
        {
          versionId: 'version-2',
          authorName: 'Ada',
          authorEmail: 'ada@example.com',
          title: 'Ada status line',
          slug: 'ada-status-line',
        },
        send,
      ),
    ).rejects.toThrow('Resend validation_error (422)')
  })
})
