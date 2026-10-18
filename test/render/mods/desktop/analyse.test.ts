import { describe, expect, it } from 'vitest'
import { analyseShot } from '@/render/mods/desktop/analyse'
import type { AnalysisSandbox } from '@/render/mods/desktop/desktop-sandbox'
import {
  CONTENT,
  PANE_BORDER_GREY,
  PROMPT_BORDER_GREY,
  PROMPT_BOX,
  type Rect,
  SCALE,
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

interface FakeShots {
  baseline?: string
  shot?: string
  compare?: string
  /** Where the shot differs from the baseline: the comparison answers with what its masks leave. */
  changes?: Rect[]
  content?: string
  plate?: string
  /** The shot across the pane's body. */
  pane?: string
  /** The shot across the whole crop, and how it differs from the baseline there. */
  cropContent?: string
  changedRows?: string
  crop?: (width: number, height: number) => Uint8Array
}

/** What a row-profile command prints: by row change, across the crop, plate, pane or column. */
function profileFor(command: string, opts: FakeShots): string {
  if (command.includes('difference -composite -crop')) return opts.changedRows ?? profile()
  if (command.includes('-crop 708x')) return opts.pane ?? profile()
  if (command.includes('-crop 1568x'))
    return opts.cropContent ?? opts.content ?? profile(PROMPT_ROWS)
  if (command.includes('-crop 6x')) return opts.plate ?? profile()
  return opts.content ?? profile(PROMPT_ROWS)
}

/** What the comparison prints for `changes` outside the command's masks, in device pixels. */
function comparisonOf(command: string, changes: readonly Rect[]): string {
  const masks = [...command.matchAll(/rectangle (\d+),(\d+) (\d+),(\d+)/g)].map((m) =>
    m.slice(1).map((n) => Number(n) / SCALE),
  )
  const masked = ({ x, y, width, height }: Rect) =>
    masks.some(
      ([x0 = 0, y0 = 0, x1 = 0, y1 = 0]) =>
        x >= x0 && y >= y0 && x + width <= x1 + 1 && y + height <= y1 + 1,
    )
  const left = changes.filter((change) => !masked(change))
  if (left.length === 0) return SAME
  const x = Math.min(...left.map((c) => c.x))
  const y = Math.min(...left.map((c) => c.y))
  const right = Math.max(...left.map((c) => c.x + c.width))
  const bottom = Math.max(...left.map((c) => c.y + c.height))
  return `1 ${(right - x) * SCALE}x${(bottom - y) * SCALE}+${x * SCALE + 1}+${y * SCALE + 1}`
}

/** Answers the analysis commands as ImageMagick would for the given layouts and comparison. */
function fakeAnalysis(opts: FakeShots) {
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
        return answer(opts.changes ? comparisonOf(command, opts.changes) : (opts.compare ?? SAME))
      }
      if (command.includes('od -An')) return answer(profileFor(command, opts))
      const layout = command.includes('baseline.png') ? opts.baseline : opts.shot
      return answer(layout ?? CHAT)
    },
    readPng: async (command) => {
      ran.push(command)
      const [, w, h] = /-crop (\d+)x(\d+)/.exec(command) ?? []
      const make = opts.crop ?? ((width, height) => pngOf(width, height, ['IHDR', 'IDAT', 'IEND']))
      const chopped = [...command.matchAll(/-chop 0x(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0)
      return make(Number(w), Number(h) - chopped)
    },
  }
  return { analysis, uploaded, ran }
}

const SHOT = new Uint8Array([1])
const BASELINE = new Uint8Array([2])
/**
 * A step's message and the spinner its slash command leaves, as leitstand's `/stand` showed them,
 * and a command's reply whose first glyph's antialiasing reaches past the column, as `/flow 8`'s did.
 */
const STEP_TURNS: Rect[] = [
  { x: 864, y: 275, width: 70, height: 30 },
  { x: 166, y: 359, width: 18, height: 18 },
  { x: 165, y: 394, width: 400, height: 40 },
]
const BAND_SHOT = {
  compare: BAND,
  content: profile(BAND_ROWS, PROMPT_ROWS),
  plate: profile(BAND_ROWS),
}

describe('analyseShot', () => {
  it('uploads the shot and the baseline into the fresh sandbox', async () => {
    const { analysis, uploaded } = fakeAnalysis(BAND_SHOT)

    await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
      draws: ['above-prompt'],
    })

    expect(uploaded).toEqual([
      '/home/user/.statuslines/shot.png',
      '/home/user/.statuslines/baseline.png',
    ])
  })

  it('crops the band with the prompt box, and cards the band alone, both re-encoded', async () => {
    const { analysis, ran } = fakeAnalysis(BAND_SHOT)

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
      draws: [],
    })

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

  it('cuts the empty stretch between the chat and the band down to the gap between messages', async () => {
    const chat = profile([300, 340], BAND_ROWS, PROMPT_ROWS)
    const { analysis, ran } = fakeAnalysis({
      compare: '1 1536x1030+333+601',
      content: chat,
      plate: profile(BAND_ROWS),
      cropContent: chat,
      changedRows: profile([300, 340], BAND_ROWS),
    })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
      draws: [],
    })

    const removed = 775 - 341 - 50
    expect(result).toMatchObject({
      kind: 'shot',
      height: CONTENT.bottom - 292 - removed,
      card: { height: PROMPT_BOX.y - 769 },
    })
    expect(ran.find((c) => c.includes('-chop'))).toContain(`-chop 0x${removed * 2}+0+`)
  })

  it('keeps an empty stretch that differs from the baseline, such as where its spinner was', async () => {
    const chat = profile([300, 340], BAND_ROWS, PROMPT_ROWS)
    const { analysis, ran } = fakeAnalysis({
      compare: '1 1536x1030+333+601',
      content: chat,
      plate: profile(BAND_ROWS),
      cropContent: chat,
      changedRows: profile([300, 600], BAND_ROWS),
    })

    await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, typedSteps: false, draws: [] })

    expect(ran.find((c) => c.includes('-chop'))).toContain(`-chop 0x${(775 - 601 - 50) * 2}+0+`)
  })

  it('leaves the prompt text and the scrollbar gutter out of the comparison', async () => {
    const { analysis, ran } = fakeAnalysis(BAND_SHOT)

    await analyseShot(analysis, { shot: SHOT, baseline: BASELINE, typedSteps: false, draws: [] })

    const compare = ran.find((c) => c.includes('-compose difference -composite -compose over'))
    expect(compare?.match(/-draw 'rectangle/g)).toHaveLength(2)
  })

  it('finds nothing when the shot matches the baseline', async () => {
    const { analysis } = fakeAnalysis({ compare: SAME })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
      draws: [],
    })

    expect(result).toEqual({ kind: 'nothing' })
  })

  it("finds nothing when only the input steps' own turns changed", async () => {
    const { analysis } = fakeAnalysis({
      changes: STEP_TURNS,
      content: profile([275, 433], PROMPT_ROWS),
    })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: true,
      draws: ['above-prompt', 'toast'],
    })

    expect(result).toEqual({ kind: 'nothing' })
  })

  it("crops a band drawn after input steps from the steps' turns down, and cards the band", async () => {
    const chat = profile([275, 433], BAND_ROWS, PROMPT_ROWS)
    const { analysis } = fakeAnalysis({
      changes: [...STEP_TURNS, { x: 166, y: 775, width: 768, height: 40 }],
      content: chat,
      cropContent: chat,
      plate: profile(BAND_ROWS),
    })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: true,
      draws: ['above-prompt'],
    })

    expect(result).toMatchObject({
      kind: 'shot',
      height: CONTENT.bottom - 267 - (775 - 434 - 50),
      card: { height: PROMPT_BOX.y - 769 },
    })
  })

  it('counts a toast beside the chat after input steps', async () => {
    const { analysis } = fakeAnalysis({
      changes: [...STEP_TURNS, { x: 950, y: 90, width: 120, height: 40 }],
      content: profile([275, 433], PROMPT_ROWS),
    })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: true,
      draws: ['toast'],
    })

    expect(result).toMatchObject({ kind: 'shot' })
  })

  it('counts a change in the chat when no input steps were typed', async () => {
    const { analysis } = fakeAnalysis({
      changes: STEP_TURNS,
      content: profile([275, 433], PROMPT_ROWS),
    })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
      draws: [],
    })

    expect(result).toMatchObject({ kind: 'shot' })
  })

  it('crops chat and pane without a comparison when a pane is open', async () => {
    const { analysis, ran } = fakeAnalysis({ shot: PANE })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
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

  it("cards what the mod draws in its pane, from inside the pane's border", async () => {
    const { analysis, ran } = fakeAnalysis({
      shot: PANE,
      pane: profile([44, 68], [93, 361], [879, 887]),
    })

    const result = await analyseShot(analysis, {
      shot: SHOT,
      baseline: BASELINE,
      typedSteps: false,
      draws: ['pane'],
    })

    expect(result).toMatchObject({ kind: 'shot', card: { width: 354, height: 370 - 85 } })
    expect(ran.some((c) => c.includes('-crop 708x570+1466+170'))).toBe(true)
  })

  it('refuses a baseline that shows a pane', async () => {
    const { analysis } = fakeAnalysis({ baseline: PANE })

    await expect(
      analyseShot(analysis, { shot: SHOT, baseline: BASELINE, typedSteps: false, draws: [] }),
    ).rejects.toThrow(/baseline/)
  })

  it('refuses a crop that carries more than pixels', async () => {
    const { analysis } = fakeAnalysis({
      ...BAND_SHOT,
      crop: (w, h) => pngOf(w, h, ['IHDR', 'tEXt', 'IDAT', 'IEND']),
    })

    await expect(
      analyseShot(analysis, { shot: SHOT, baseline: BASELINE, typedSteps: false, draws: [] }),
    ).rejects.toThrow(/pixels/)
  })
})
