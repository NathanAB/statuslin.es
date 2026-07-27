import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendRejectionEmail } from '@/review/rejection-email'

const originalSiteUrl = process.env.BETTER_AUTH_URL

beforeEach(() => {
  process.env.BETTER_AUTH_URL = 'https://statuslin.es'
})

afterEach(() => {
  process.env.BETTER_AUTH_URL = originalSiteUrl
})

describe('sendRejectionEmail', () => {
  it('sends a text-only message with fixed headers and a version idempotency key', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email_123' }, error: null })

    const result = await sendRejectionEmail(
      {
        versionId: 'version-1',
        authorName: 'Ada',
        authorEmail: 'ada@example.com',
        title: 'Ada status line',
        reason: 'Remove the network updater.',
        slug: 'ada-status-line',
      },
      send,
    )

    expect(result).toEqual({ id: 'email_123' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'statuslin.es reviews <reviews@statuslin.es>',
        to: 'ada@example.com',
        replyTo: 'hello@statuslin.es',
        subject: 'Your statuslin.es submission was not accepted',
        text: expect.stringContaining('Remove the network updater.'),
      }),
      { idempotencyKey: 'rejection/version-1' },
    )
    const sentPayload = send.mock.calls[0]?.[0]
    expect(sentPayload).not.toHaveProperty('html')
    const message = sentPayload.text
    expect(message).toContain('https://statuslin.es/me')
    expect(message).toContain('https://statuslin.es/submit?resubmit=ada-status-line')
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
      sendRejectionEmail(
        {
          versionId: 'version-1',
          authorName: 'Ada',
          authorEmail: 'ada@example.com',
          title: 'Ada status line',
          reason: 'Remove the updater.',
          slug: 'ada-status-line',
        },
        send,
      ),
    ).rejects.toMatchObject({
      name: 'ReviewEmailProviderError',
      message: 'Resend validation_error (422)',
    })
  })
})
