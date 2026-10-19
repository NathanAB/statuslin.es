// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getHomeShowcaseFn = vi.hoisted(() => vi.fn())
vi.mock('@/home/functions', () => ({ getHomeShowcaseFn }))

beforeEach(() => {
  vi.resetModules()
  getHomeShowcaseFn.mockReset()
})

// The home loader runs again on every sort, kind, tag or page change, but the hero, walkthrough and
// mods row are the same whatever the gallery shows, so the browser asks for them once.
describe('loadShowcase in the browser', () => {
  it('asks the server once, however often the gallery changes', async () => {
    getHomeShowcaseFn.mockResolvedValue([{ slug: 'panel' }])
    const { loadShowcase } = await import('@/home/load-showcase')

    expect(await loadShowcase()).toEqual([{ slug: 'panel' }])
    expect(await loadShowcase()).toEqual([{ slug: 'panel' }])
    expect(getHomeShowcaseFn).toHaveBeenCalledTimes(1)
  })

  it('asks again after a failure', async () => {
    getHomeShowcaseFn.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
    const { loadShowcase } = await import('@/home/load-showcase')

    await expect(loadShowcase()).rejects.toThrow('offline')
    expect(await loadShowcase()).toEqual([])
    expect(getHomeShowcaseFn).toHaveBeenCalledTimes(2)
  })
})
