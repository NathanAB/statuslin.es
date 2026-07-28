import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('PostHog client error queue', () => {
  it('buffers errors until connect, flushes once, then captures later errors immediately', async () => {
    const captureException = vi.fn()
    vi.stubGlobal('location', {
      pathname: '/status-lines/bash',
      search: '?private=secret',
      hash: '#hidden',
      href: 'https://statuslin.es/status-lines/bash?private=secret#hidden',
    })
    const { connectPostHogClientErrors, queuePostHogClientError } = await import(
      '@/lib/posthog-client-errors'
    )
    const earlyError = new Error('early')
    const lateError = new Error('late')

    queuePostHogClientError(earlyError)
    expect(captureException).not.toHaveBeenCalled()

    connectPostHogClientErrors({ captureException })
    connectPostHogClientErrors({ captureException })
    queuePostHogClientError(lateError)

    expect(captureException.mock.calls).toEqual([
      [earlyError, { source: 'router', path: '/status-lines/bash' }],
      [lateError, { source: 'router', path: '/status-lines/bash' }],
    ])
  })

  it('keeps only the path captured at the time an early error occurs', async () => {
    const captureException = vi.fn()
    const currentLocation = { pathname: '/before', search: '?token=secret', hash: '#private' }
    vi.stubGlobal('location', currentLocation)
    const { connectPostHogClientErrors, queuePostHogClientError } = await import(
      '@/lib/posthog-client-errors'
    )
    const error = new Error('early')

    queuePostHogClientError(error)
    currentLocation.pathname = '/after'
    connectPostHogClientErrors({ captureException })

    expect(captureException).toHaveBeenCalledWith(error, {
      source: 'router',
      path: '/before',
    })
  })

  it('never lets PostHog failures escape the router', async () => {
    const captureException = vi.fn(() => {
      throw new Error('PostHog unavailable')
    })
    vi.stubGlobal('location', { pathname: '/terms' })
    const { connectPostHogClientErrors, queuePostHogClientError } = await import(
      '@/lib/posthog-client-errors'
    )

    queuePostHogClientError(new Error('early'))

    expect(() => connectPostHogClientErrors({ captureException })).not.toThrow()
    expect(() => queuePostHogClientError(new Error('late'))).not.toThrow()
    expect(captureException).toHaveBeenCalledTimes(2)
  })
})
