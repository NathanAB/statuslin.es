import { H3 } from 'h3'
import { createHooks } from 'hookable'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isClientDisconnect } from '@/server/client-disconnect'

const captureServerException = vi.hoisted(() => vi.fn())

vi.mock('@/lib/posthog-server', () => ({ captureServerException }))
vi.mock('nitro', () => ({
  definePlugin: (plugin: unknown) => plugin,
}))

const plugin = (await import('@/server/posthog-error-plugin')).default as unknown as (app: {
  hooks: {
    hook: (
      name: 'error',
      callback: (error: Error, context: Record<string, unknown>) => void,
    ) => void
  }
}) => void

afterEach(() => {
  vi.restoreAllMocks()
  captureServerException.mockClear()
})

describe('PostHog Nitro error plugin', () => {
  it('reports an unhandled request while H3 preserves its generated 500 response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hooks = createHooks<{
      error: (error: Error, context: Record<string, unknown>) => void
    }>()
    plugin({ hooks })
    const fatalError = new Error('fatal SSR render')
    const app = new H3({
      async onError(error, event) {
        await hooks.callHook('error', error, { event })
      },
    })
    app.on('GET', '/fatal', () => {
      throw fatalError
    })

    const response = await app.request('https://statuslin.es/fatal')

    expect(response.status).toBe(500)
    expect(captureServerException).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, cause: fatalError }),
      {
        source: 'ssr',
        properties: {
          path: '/fatal',
          method: 'GET',
        },
      },
    )
  })

  it('drops a client disconnect instead of forwarding it to PostHog', async () => {
    const hooks = createHooks<{
      error: (error: Error, context: Record<string, unknown>) => void
    }>()
    plugin({ hooks })
    // srvx raises this when the browser closes the tab mid-request (e.g. a posthog-js flush).
    const aborted = Object.assign(new Error('aborted'), { name: 'HTTPError' })

    await hooks.callHook('error', aborted, {
      event: { req: { url: 'https://statuslin.es/ingest/i/v0/e/', method: 'POST' } },
    })

    expect(captureServerException).not.toHaveBeenCalled()
  })
})

describe('isClientDisconnect', () => {
  it('matches the srvx aborted error a tab-close raises', () => {
    expect(isClientDisconnect(Object.assign(new Error('aborted'), { name: 'HTTPError' }))).toBe(
      true,
    )
  })

  it('matches socket resets and broken pipes by error code', () => {
    expect(
      isClientDisconnect(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
    ).toBe(true)
    expect(isClientDisconnect(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toBe(
      true,
    )
  })

  it('matches an AbortError by name', () => {
    expect(
      isClientDisconnect(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      ),
    ).toBe(true)
  })

  it('finds a disconnect wrapped in an error cause', () => {
    const wrapper = new Error('Request failed', {
      cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    })
    expect(isClientDisconnect(wrapper)).toBe(true)
  })

  it('lets a genuine server error through', () => {
    expect(isClientDisconnect(new Error('fatal SSR render'))).toBe(false)
    expect(isClientDisconnect(Object.assign(new Error('nope'), { name: 'HTTPError' }))).toBe(false)
    expect(isClientDisconnect(null)).toBe(false)
  })
})
