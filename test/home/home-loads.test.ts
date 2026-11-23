// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getHomeShowcaseFn = vi.hoisted(() => vi.fn())
const getHomeThemesFn = vi.hoisted(() => vi.fn())
vi.mock('@/home/functions', () => ({ getHomeShowcaseFn }))
vi.mock('@/themes/functions', () => ({ getHomeThemesFn }))

beforeEach(() => {
  vi.resetModules()
  getHomeShowcaseFn.mockReset()
  getHomeThemesFn.mockReset()
})

// The home loader runs again on every sort, kind, tag or page change, but the hero's list is the
// same whatever the gallery shows, so the browser asks for it once.
describe('loadShowcase in the browser', () => {
  it('asks the server once, however often the gallery changes', async () => {
    getHomeShowcaseFn.mockResolvedValue([{ slug: 'panel' }])
    const { loadShowcase } = await import('@/home/home-loads')

    expect(await loadShowcase()).toEqual([{ slug: 'panel' }])
    expect(await loadShowcase()).toEqual([{ slug: 'panel' }])
    expect(getHomeShowcaseFn).toHaveBeenCalledTimes(1)
  })

  it('asks again after a failure', async () => {
    getHomeShowcaseFn.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
    const { loadShowcase } = await import('@/home/home-loads')

    await expect(loadShowcase()).rejects.toThrow('offline')
    expect(await loadShowcase()).toEqual([])
    expect(getHomeShowcaseFn).toHaveBeenCalledTimes(2)
  })
})

// The themes row is the same whatever the gallery shows, too.
describe('loadHomeThemes in the browser', () => {
  it('asks the server once, however often the gallery changes', async () => {
    getHomeThemesFn.mockResolvedValue({ themes: [], total: 81 })
    const { loadHomeThemes } = await import('@/home/home-loads')

    expect(await loadHomeThemes()).toEqual({ themes: [], total: 81 })
    expect(await loadHomeThemes()).toEqual({ themes: [], total: 81 })
    expect(getHomeThemesFn).toHaveBeenCalledTimes(1)
  })
})
