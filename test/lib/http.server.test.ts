import { notFound, redirect } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'

const captureServerException = vi.hoisted(() => vi.fn())
vi.mock('@/lib/posthog-server', () => ({ captureServerException }))

const setResponseStatus = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-start/server', () => ({ setResponseStatus }))

afterEach(() => {
  captureServerException.mockReset()
  setResponseStatus.mockReset()
})

describe('withHttpStatus', () => {
  it('returns the body result and captures nothing on success', async () => {
    const result = await withHttpStatus(async () => 'ok')
    expect(result).toBe('ok')
    expect(captureServerException).not.toHaveBeenCalled()
    expect(setResponseStatus).not.toHaveBeenCalled()
  })

  it('captures an unexpected (non-HttpError) throw as a server-fn error, then rethrows', async () => {
    const err = new Error('boom')
    await expect(
      withHttpStatus(async () => {
        throw err
      }),
    ).rejects.toBe(err)
    expect(captureServerException).toHaveBeenCalledWith(err, { source: 'server-fn' })
  })

  it('does not capture an HttpError — sets the response status and rethrows', async () => {
    const err = new HttpError(403, 'nope')
    await expect(
      withHttpStatus(async () => {
        throw err
      }),
    ).rejects.toBe(err)
    expect(setResponseStatus).toHaveBeenCalledWith(403)
    expect(captureServerException).not.toHaveBeenCalled()
  })

  it('does not capture a router redirect (control flow), and rethrows it', async () => {
    const r = redirect({ to: '/' })
    await expect(
      withHttpStatus(async () => {
        throw r
      }),
    ).rejects.toBe(r)
    expect(captureServerException).not.toHaveBeenCalled()
  })

  it('does not capture a router notFound (control flow), and rethrows it', async () => {
    const nf = notFound()
    await expect(
      withHttpStatus(async () => {
        throw nf
      }),
    ).rejects.toBe(nf)
    expect(captureServerException).not.toHaveBeenCalled()
  })
})
