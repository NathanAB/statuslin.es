import { describe, expect, it } from 'vitest'
import { analyseShot } from '@/render/mods/desktop/analyse'
import type { AnalysisSandbox } from '@/render/mods/desktop/desktop-sandbox'
import {
  CONTENT,
  PANE_BORDER_GREY,
  PROMPT_BORDER_GREY,
  PROMPT_BOX,
  WINDOW,
} from '@/render/mods/desktop/screen'

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

/** od's output for a row profile: 255 on the given rows, 0 elsewhere. */
function profile(...runs: [number, number][]): string {
  const bytes = Array<number>(WINDOW.height).fill(0)
  for (const [from, to] of runs) bytes.fill(255, from, to + 1)
  return ` ${bytes.join(' ')}\n`
}

const CHAT = `${PROMPT_BORDER_GREY} 0\n${20 / 255} 0\n0.3 0.2\n`
const PANE = `0.1 0.05\n${PROMPT_BORDER_GREY} 0\n${PANE_BORDER_GREY} 0\n`
const BAND = '1 1536x80+333+1551'
const SAME = '0 0x0+2202+1802'
const BAND_ROWS: [number, number] = [775, 814]
const PROMPT_ROWS: [number, number] = [PROMPT_BOX.y, PROMPT_BOX.y + 39]

/** Answers the analysis commands as ImageMagick would for the given layouts and comparison. */
function fakeAnalysis(opts: {
  baseline?: string
  shot?: string
  compare?: string
  content?: string
  plate?: string
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
      const answer = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
      if (command.includes('-compose difference -composite -compose over')) {
        return answer(opts.compare ?? SAME)
      }
      if (command.includes('od -An')) {
        const plate = command.includes('-crop 6x')
        return answer(plate ? (opts.plate ?? profile()) : (opts.content ?? profile(PROMPT_ROWS)))
      }
      const layout = command.includes('baseline.png') ? opts.baseline : opts.shot
      return answer(layout ?? CHAT)
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
const BAND_SHOT = {
  compare: BAND,
  content: profile(BAND_ROWS, PROMPT_ROWS),
  plate: profile(BAND_ROWS),
}

describe('analyseShot', () => {
  it('uploads the shot and the baseline into the fresh sandbox', async () => {
    const { analysis, uploaded } = fakeAnalysis(BAND_SHOT)

    await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: ['above-prompt'] })

    expect(uploaded).toEqual([
      '/home/user/.statuslines/shot.png',
      '/home/user/.statuslines/baseline.png',
    ])
  })

  it('crops the band with the prompt box, and cards the band alone, both re-encoded', async () => {
    const { analysis, ran } = fakeAnalysis(BAND_SHOT)

    const result = await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] })

    expect(result).toMatchObject({
      kind: 'shot',
      width: 784,
      height: CONTENT.bottom - 767,
      card: { width: 784, height: PROMPT_BOX.y - 769 },
    })
    const crops = ran.filter((c) => c.includes('png:-'))
    expect(crops).toHaveLength(2)
    for (const crop of crops) expect(crop).toContain('-strip -define png:exclude-chunks=all')
  })

  it('leaves the prompt text and the scrollbar gutter out of the comparison', async () => {
    const { analysis, ran } = fakeAnalysis(BAND_SHOT)

    await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] })

    const compare = ran.find((c) => c.includes('-compose difference -composite -compose over'))
    expect(compare?.match(/-draw 'rectangle/g)).toHaveLength(2)
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

    expect(result).toMatchObject({
      kind: 'shot',
      width: 1055,
      height: CONTENT.bottom - 40,
      card: { width: 1055, height: 150 },
    })
    expect(ran.some((c) => c.includes('-compose difference -composite -compose over'))).toBe(false)
  })

  it('refuses a baseline that shows a pane', async () => {
    const { analysis } = fakeAnalysis({ baseline: PANE })

    await expect(
      analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] }),
    ).rejects.toThrow(/baseline/)
  })

  it('refuses a crop that carries more than pixels', async () => {
    const { analysis } = fakeAnalysis({
      ...BAND_SHOT,
      crop: (w, h) => pngOf(w, h, ['IHDR', 'tEXt', 'IDAT', 'IEND']),
    })

    await expect(
      analyseShot(analysis, { shot: SHOT, baseline: BASELINE, draws: [] }),
    ).rejects.toThrow(/pixels/)
  })
})
