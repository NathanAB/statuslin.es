import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock posthog-node so no real client or network is built. captureException /
// captureExceptionImmediate are spies we assert against; vi.resetModules() between
// tests gives each one a fresh getPostHogClient() singleton. PostHog is mocked as a
// class so `new PostHog(...)` returns an instance carrying the spies (a vi.fn factory
// used with `new` would hand back an empty `this`, not the returned object).
const { captureException, captureExceptionImmediate } = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureExceptionImmediate: vi.fn(),
}))
vi.mock('posthog-node', () => ({
  PostHog: class {
    captureException = captureException
    captureExceptionImmediate = captureExceptionImmediate
  },
}))

const TOKEN = 'POSTHOG_PROJECT_TOKEN'

describe('captureServerException', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env[TOKEN]
    vi.resetModules()
    captureException.mockReset()
    captureExceptionImmediate.mockReset()
  })

  afterEach(() => {
    if (original === undefined) delete process.env[TOKEN]
    else process.env[TOKEN] = original
  })

  it('no-ops and does not throw when the token is unset (analytics disabled)', async () => {
    delete process.env[TOKEN]
    const { captureServerException } = await import('@/lib/posthog-server')
    expect(() => captureServerException(new Error('boom'))).not.toThrow()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('sends the error with a default "server" distinctId and a server flag', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    const err = new Error('boom')
    captureServerException(err, { source: 'worker' })
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      err,
      'server',
      expect.objectContaining({ serverException: true, source: 'worker' }),
    )
  })

  it('uses the provided distinctId when one is given', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    const err = new Error('x')
    captureServerException(err, { distinctId: 'user-123' })
    expect(captureException).toHaveBeenCalledWith(err, 'user-123', expect.any(Object))
  })

  it('merges allowlisted properties from context', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    const err = new Error('x')
    captureServerException(err, { source: 'ssr', properties: { path: '/c/foo', status: 500 } })
    expect(captureException).toHaveBeenCalledWith(
      err,
      'server',
      expect.objectContaining({
        serverException: true,
        source: 'ssr',
        path: '/c/foo',
        status: 500,
      }),
    )
  })

  it('never throws even when the client errors (fail-soft)', async () => {
    captureException.mockImplementation(() => {
      throw new Error('network down')
    })
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    expect(() => captureServerException(new Error('x'))).not.toThrow()
  })

  it('captures a given error object only once (dedup guard)', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    const err = new Error('once')
    captureServerException(err)
    captureServerException(err)
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})

describe('captureServerExceptionImmediate', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env[TOKEN]
    vi.resetModules()
    captureException.mockReset()
    captureExceptionImmediate.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (original === undefined) delete process.env[TOKEN]
    else process.env[TOKEN] = original
  })

  it('awaits the immediate send with the server defaults', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerExceptionImmediate } = await import('@/lib/posthog-server')
    const err = new Error('fatal')
    await captureServerExceptionImmediate(err, { source: 'uncaught' })
    expect(captureExceptionImmediate).toHaveBeenCalledTimes(1)
    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      err,
      'server',
      expect.objectContaining({ serverException: true, source: 'uncaught' }),
    )
  })

  it('resolves (never rejects) when the client throws', async () => {
    captureExceptionImmediate.mockRejectedValue(new Error('send failed'))
    process.env[TOKEN] = 'phc_test'
    const { captureServerExceptionImmediate } = await import('@/lib/posthog-server')
    await expect(captureServerExceptionImmediate(new Error('x'))).resolves.toBeUndefined()
  })

  it('no-ops when the token is unset', async () => {
    delete process.env[TOKEN]
    const { captureServerExceptionImmediate } = await import('@/lib/posthog-server')
    await captureServerExceptionImmediate(new Error('x'))
    expect(captureExceptionImmediate).not.toHaveBeenCalled()
  })
})
