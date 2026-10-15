import { describe, expect, it } from 'vitest'
import { cropModPreview } from '@/render/mods/crop'
import { FakeModRecorder } from '@/render/mods/fake-recorder'
import baseline from './fixtures/baseline.json'
import tokenWeather from './fixtures/token-weather.json'

const tokenWeatherMod = {
  source: { tarball: new Uint8Array([1, 2, 3]), path: 'claude-code/mods/token-weather' },
  pluginName: 'token-weather',
}

describe('FakeModRecorder', () => {
  const recorder = new FakeModRecorder({ baseline, mods: { 'token-weather': tokenWeather } })

  it('gives a mod recording that crops to a rendered preview against the baseline', async () => {
    const base = await recorder.record({ mod: null, inputSteps: [] })
    const mod = await recorder.record({ mod: tokenWeatherMod, inputSteps: [] })

    expect(cropModPreview(base.rows, mod.rows).kind).toBe('rendered')
    expect(mod.claudeCodeVersion).toBe(base.claudeCodeVersion)
  })

  it('records a mod it has no screen for as the baseline, which crops to nothing', async () => {
    const base = await recorder.record({ mod: null, inputSteps: [] })
    const other = await recorder.record({
      mod: { ...tokenWeatherMod, pluginName: 'agent-radar' },
      inputSteps: [{ type: 'text', text: '/radar' }],
    })

    expect(cropModPreview(base.rows, other.rows)).toEqual({ kind: 'not-rendered' })
  })

  it('keeps each request, input steps included', async () => {
    const fake = new FakeModRecorder({ baseline })
    const inputSteps = [{ type: 'text' as const, text: 'look', submit: false }]

    await fake.record({ mod: tokenWeatherMod, inputSteps })

    expect(fake.requests).toEqual([{ mod: tokenWeatherMod, inputSteps }])
  })
})
