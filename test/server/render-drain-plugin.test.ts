import { describe, expect, it, vi } from 'vitest'

vi.mock('nitro', () => ({
  definePlugin: (plugin: unknown) => plugin,
}))
const triggerRenderDrain = vi.hoisted(() => vi.fn())
vi.mock('@/server/render-drain', () => ({ triggerRenderDrain }))

const plugin = (await import('@/server/render-drain-plugin')).default as unknown as () => void

describe('render drain Nitro plugin', () => {
  it('renders the jobs already queued when the server starts', () => {
    plugin()

    expect(triggerRenderDrain).toHaveBeenCalledOnce()
  })
})
