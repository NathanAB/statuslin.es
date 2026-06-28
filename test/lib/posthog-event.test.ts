import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({
  capture: vi.fn(),
}))
vi.mock('posthog-node', () => ({
  PostHog: class {
    capture = capture
    captureException = vi.fn()
    captureExceptionImmediate = vi.fn()
  },
}))

const ORIGINAL = process.env.POSTHOG_PROJECT_TOKEN
beforeEach(() => {
  vi.resetModules()
  capture.mockClear()
  process.env.POSTHOG_PROJECT_TOKEN = 'phc_test'
})
afterEach(() => {
  process.env.POSTHOG_PROJECT_TOKEN = ORIGINAL
})

describe('captureServerEvent', () => {
  it('captures the event with the given distinctId and properties', async () => {
    const { captureServerEvent } = await import('@/lib/posthog-server')
    captureServerEvent('render_worker_heartbeat', 'render-worker', { ok: true })
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'render_worker_heartbeat',
        distinctId: 'render-worker',
        properties: { ok: true },
      }),
    )
  })
  it('is a no-op (no throw) when the token is unset', async () => {
    process.env.POSTHOG_PROJECT_TOKEN = ''
    const { captureServerEvent } = await import('@/lib/posthog-server')
    expect(() => captureServerEvent('render_worker_heartbeat', 'render-worker')).not.toThrow()
    expect(capture).not.toHaveBeenCalled()
  })
})
