import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock posthog-node so no real client or network is built. captureException is the spy we
// assert against; vi.resetModules() between
// tests gives each one a fresh getPostHogClient() singleton. PostHog is mocked as a
// class so `new PostHog(...)` returns an instance carrying the spies (a vi.fn factory
// used with `new` would hand back an empty `this`, not the returned object).
const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('posthog-node', () => ({
  PostHog: class {
    captureException = captureException
  },
}))

const TOKEN = 'POSTHOG_PROJECT_TOKEN'

describe('captureServerException', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env[TOKEN]
    vi.resetModules()
    captureException.mockReset()
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
    captureServerException(err, { source: 'render-drain' })
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      err,
      'server',
      expect.objectContaining({ serverException: true, source: 'render-drain' }),
    )
  })

  it('skips person processing for the default "server" distinctId', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    captureServerException(new Error('boom'))
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      'server',
      expect.objectContaining({ $process_person_profile: false }),
    )
  })

  it('uses the provided distinctId, keeping person processing, when one is given', async () => {
    process.env[TOKEN] = 'phc_test'
    const { captureServerException } = await import('@/lib/posthog-server')
    const err = new Error('x')
    captureServerException(err, { distinctId: 'user-123' })
    expect(captureException).toHaveBeenCalledWith(err, 'user-123', expect.any(Object))
    expect(captureException.mock.calls[0]?.[2]).not.toHaveProperty('$process_person_profile')
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
