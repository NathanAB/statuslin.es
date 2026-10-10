import { describe, expect, it, vi } from 'vitest'
import { MAX_INPUT_STEPS, MAX_STEP_CHARS } from '@/render/mods/desktop/drive'
import { desktopRecorder, sharedOnce } from '@/render/mods/desktop/recorder'

const MOD = { source: { tarball: new Uint8Array(), path: '' }, pluginName: 'token-weather' }

describe('sharedOnce', () => {
  it('runs once for every caller, at the same time or later', async () => {
    const make = vi.fn(async () => 'baseline')
    const baseline = sharedOnce(make)

    const results = await Promise.all([baseline(), baseline(), baseline()])

    expect(results).toEqual(['baseline', 'baseline', 'baseline'])
    expect(await baseline()).toBe('baseline')
    expect(make).toHaveBeenCalledTimes(1)
  })

  it('tries again for the next caller after a failure', async () => {
    const make = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('E2B hiccup'))
      .mockResolvedValue('baseline')
    const baseline = sharedOnce(make)

    await expect(baseline()).rejects.toThrow('E2B hiccup')
    expect(await baseline()).toBe('baseline')
    expect(make).toHaveBeenCalledTimes(2)
  })
})

describe('desktopRecorder', () => {
  it('allows at least the curated steps', () => {
    expect(MAX_INPUT_STEPS).toBeGreaterThanOrEqual(3)
  })

  it('refuses more input steps than the sandbox lifetime fits, before opening a sandbox', async () => {
    const withDesktopSandbox = vi.fn()
    const steps = Array.from({ length: MAX_INPUT_STEPS + 1 }, () => ({
      type: 'text' as const,
      text: '/radar',
    }))

    await expect(
      desktopRecorder({ withDesktopSandbox }).record({ mod: MOD, inputSteps: steps, draws: [] }),
    ).rejects.toThrow(/input steps/)
    expect(withDesktopSandbox).not.toHaveBeenCalled()
  })

  it('refuses a step too long to type inside its wait', async () => {
    const withDesktopSandbox = vi.fn()
    const step = { type: 'text' as const, text: 'x'.repeat(MAX_STEP_CHARS + 1) }

    await expect(
      desktopRecorder({ withDesktopSandbox }).record({ mod: MOD, inputSteps: [step], draws: [] }),
    ).rejects.toThrow(/characters/)
    expect(withDesktopSandbox).not.toHaveBeenCalled()
  })
})
