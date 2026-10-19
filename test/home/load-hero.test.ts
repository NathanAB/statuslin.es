// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getHeroLinesFn = vi.hoisted(() => vi.fn())
vi.mock('@/gallery/functions', () => ({ getHeroLinesFn }))

beforeEach(() => {
  vi.resetModules()
  getHeroLinesFn.mockReset()
})

// The home loader runs again on every sort, kind, tag or page change, but the hero shows the same
// eight status lines whatever the gallery shows, so the browser asks for them once.
describe('loadHeroLines in the browser', () => {
  it('asks the server once, however often the gallery changes', async () => {
    getHeroLinesFn.mockResolvedValue([{ slug: 'panel' }])
    const { loadHeroLines } = await import('@/home/load-hero')

    expect(await loadHeroLines()).toEqual([{ slug: 'panel' }])
    expect(await loadHeroLines()).toEqual([{ slug: 'panel' }])
    expect(getHeroLinesFn).toHaveBeenCalledTimes(1)
  })

  it('asks again after a failure', async () => {
    getHeroLinesFn.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
    const { loadHeroLines } = await import('@/home/load-hero')

    await expect(loadHeroLines()).rejects.toThrow('offline')
    expect(await loadHeroLines()).toEqual([])
    expect(getHeroLinesFn).toHaveBeenCalledTimes(2)
  })
})
