import { describe, expect, it } from 'vitest'
import { analyseShot } from '@/render/mods/desktop/analyse'
import type { AnalysisSandbox } from '@/render/mods/desktop/desktop-sandbox'
import { PANE_BORDER_GREY, PROMPT_BORDER_GREY } from '@/render/mods/desktop/screen'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngOf(width: number, height: number, types: string[]): Uint8Array {
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, width)
  new DataView(ihdr.buffer).setUint32(4, height)
  const chunks = types.map((type) => {
    const data = type === 'IHDR' ? ihdr : new Uint8Array(type === 'IEND' ? 0 : 3)
    const chunk = new Uint8Array(12 + data.length)
    new DataView(chunk.buffer).setUint32(0, data.length)
    chunk.set(new TextEncoder().encode(type), 4)
    chunk.set(data, 8)
    return chunk
  })
  return new Uint8Array(Buffer.concat([Buffer.from(SIGNATURE), ...chunks]))
}

const CHAT = `${PROMPT_BORDER_GREY} 0\n${20 / 255} 0\n0.3 0.2\n`
const PANE = `0.1 0.05\n${PROMPT_BORDER_GREY} 0\n${PANE_BORDER_GREY} 0\n`
const BAND = '1 1536x80+333+1031'
const SAME = '0 0x0+2202+1282'

/** Answers the analysis commands as ImageMagick would for the given layouts and comparison. */
function fakeAnalysis(opts: {
  baseline?: string
  shot?: string
  compare?: string
  crop?: (width: number, height: number) => Uint8Array
}) {
  const uploaded: string[] = []
  const ran: string[] = []
  const analysis: AnalysisSandbox = {
    writeFiles: async (files) => {
      uploaded.push(...files.map((f) => f.path))
    },
    run: async (command) => {
      ran.push(command)
      if (command.includes('-compose difference')) {
        return { exitCode: 0, stdout: opts.compare ?? SAME, stderr: '' }
      }
      const layout = command.includes('baseline.png') ? opts.baseline : opts.shot
      return { exitCode: 0, stdout: layout ?? CHAT, stderr: '' }
    },
    readPng: async (command) => {
      ran.push(command)
      const [, w, h] = /-crop (\d+)x(\d+)/.exec(command) ?? []
      const make = opts.crop ?? ((width, height) => pngOf(width, height, ['IHDR', 'IDAT', 'IEND']))
      return make(Number(w), Number(h))
    },
  }
  return { analysis, uploaded, ran }
}

const SHOT = new Uint8Array([1])
const BASELINE = new Uint8Array([2])

describe('analyseShot', () => {
  it('uploads the shot and the baseline into the fresh sandbox', async () => {
    const { analysis, uploaded } = fakeAnalysis({ compare: BAND })

    await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: ['above-prompt'] })

    expect(uploaded).toEqual([
      '/home/user/.statuslines/shot.png',
      '/home/user/.statuslines/baseline.png',
    ])
  })

  it('crops the changed band with the prompt box, re-encoded, anchored at the bottom', async () => {
    const { analysis, ran } = fakeAnalysis({ compare: BAND })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      draws: ['above-prompt'],
    })

    expect(result).toMatchObject({ kind: 'shot', width: 784, height: 129, cardAnchor: 'bottom' })
    expect(ran.at(-1)).toContain('-strip -define png:exclude-chunks=all png:-')
  })

  it('finds nothing when the shot matches the baseline', async () => {
    const { analysis } = fakeAnalysis({ compare: SAME })

    const result = await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] })

    expect(result).toEqual({ kind: 'nothing' })
  })

  it('crops chat and pane without a comparison when a pane is open', async () => {
    const { analysis, ran } = fakeAnalysis({ shot: PANE })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      draws: ['pane', 'toast'],
    })

    expect(result).toMatchObject({ kind: 'shot', width: 1055, height: 596, cardAnchor: 'top' })
    expect(ran.some((c) => c.includes('-compose difference'))).toBe(false)
  })

  it('refuses a baseline that shows a pane', async () => {
    const { analysis } = fakeAnalysis({ baseline: PANE })

    await expect(
      analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] }),
    ).rejects.toThrow(/baseline/)
  })

  it('refuses a crop that carries more than pixels', async () => {
    const { analysis } = fakeAnalysis({
      compare: BAND,
      crop: (w, h) => pngOf(w, h, ['IHDR', 'tEXt', 'IDAT', 'IEND']),
    })

    await expect(
      analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] }),
    ).rejects.toThrow(/pixels/)
  })
})
