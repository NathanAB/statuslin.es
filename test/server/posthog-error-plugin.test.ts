import { H3 } from 'h3'
import { createHooks } from 'hookable'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
})
