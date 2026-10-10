import { describe, expect, it } from 'vitest'
import { FakeDesktopRecorder } from '@/render/mods/desktop/fake-recorder'

const mod = (pluginName: string) => ({
  source: { tarball: new Uint8Array([1, 2, 3]), path: '' },
  pluginName,
})
const SHOT = {
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  width: 790,
  height: 52,
  cardAnchor: 'bottom' as const,
}

describe('FakeDesktopRecorder', () => {
  it('records the shot it was given for a mod', async () => {
    const recorder = new FakeDesktopRecorder({ meter: SHOT })

    expect(await recorder.record({ mod: mod('meter'), inputSteps: [], draws: [] })).toEqual({
      kind: 'shot',
      ...SHOT,
      desktopVersion: '0.0.0-fake',
      engineVersion: '0.0.0-fake',
    })
  })

  it('records a mod it has no shot for as drawing nothing', async () => {
    const recorder = new FakeDesktopRecorder({ meter: SHOT })

    expect(await recorder.record({ mod: mod('radar'), inputSteps: [], draws: ['pane'] })).toEqual({
      kind: 'nothing',
      desktopVersion: '0.0.0-fake',
      engineVersion: '0.0.0-fake',
    })
  })

  it('keeps each request', async () => {
    const recorder = new FakeDesktopRecorder()
    const request = {
      mod: mod('radar'),
      inputSteps: [{ type: 'text' as const, text: '/radar' }],
      draws: ['pane' as const],
    }

    await recorder.record(request)

    expect(recorder.requests).toEqual([request])
  })
})
