import { describe, expect, it, vi } from 'vitest'
import { analyseShot } from '@/render/mods/desktop/analyse'
import { MAX_INPUT_STEPS, MAX_STEP_CHARS } from '@/render/mods/desktop/drive'
import { desktopRecorder, sharedOnce } from '@/render/mods/desktop/recorder'

vi.mock('@/render/mods/desktop/analyse', () => ({
  analyseShot: vi.fn(async () => ({ kind: 'nothing' })),
}))

const MOD = { source: { tarball: new Uint8Array(), path: '' }, pluginName: 'token-weather' }
const FULL_SHOT = { desktopVersion: '2.31226.1', engineVersion: '2.1.0', png: new Uint8Array() }

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
    const sandboxes = { withRecordingDesktop: vi.fn(), withAnalysisSandbox: vi.fn() }
    const steps = Array.from({ length: MAX_INPUT_STEPS + 1 }, () => ({
      type: 'text' as const,
      text: '/radar',
    }))

    await expect(
      desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: steps, draws: [] }),
    ).rejects.toThrow(/input steps/)
    expect(sandboxes.withRecordingDesktop).not.toHaveBeenCalled()
  })

  it('refuses a step too long to type inside its wait', async () => {
    const sandboxes = { withRecordingDesktop: vi.fn(), withAnalysisSandbox: vi.fn() }
    const step = { type: 'text' as const, text: 'x'.repeat(MAX_STEP_CHARS + 1) }

    await expect(
      desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: [step], draws: [] }),
    ).rejects.toThrow(/characters/)
    expect(sandboxes.withRecordingDesktop).not.toHaveBeenCalled()
  })

  it.each([
    { steps: [{ type: 'text' as const, text: '/stand' }], typedSteps: true },
    { steps: [], typedSteps: false },
  ])(
    'tells the analysis whether the mod session typed input steps the baseline did not ($typedSteps)',
    async ({ steps, typedSteps }) => {
      const sandboxes = {
        withRecordingDesktop: vi.fn().mockResolvedValue(FULL_SHOT),
        withAnalysisSandbox: vi.fn().mockImplementation((use: (a: object) => unknown) => use({})),
      }

      await desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: steps, draws: [] })

      expect(vi.mocked(analyseShot)).toHaveBeenLastCalledWith(
        {},
        expect.objectContaining({ typedSteps }),
      )
    },
  )
})
