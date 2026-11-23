import { describe, expect, it } from 'vitest'
import type { AnalysisSandbox } from '@/render/mods/desktop/desktop-sandbox'
import { SCALE } from '@/render/mods/desktop/screen'
import { analyseTheme, analyseWindow, DesktopThemeRefused } from '@/render/mods/desktop/window-shot'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngOf(width: number, height: number, types = ['IHDR', 'IDAT', 'IEND']): Uint8Array {
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

const CHANGED = '1 400x300+11+101'
const SAME = '0 0x0+2202+1802'

interface FakeShots {
  /** What comparing the shot with the no-mod baseline prints. */
  frame?: string
  /** What comparing the two runs of the theme prints. */
  runs?: string
  /** The prompt box fill's grey in the shot. */
  promptGrey?: number
  /** The chunks each PNG the analysis prints is made of. */
  chunks?: string[]
}

function fakeAnalysis({ frame = CHANGED, runs = SAME, promptGrey = 0.1, chunks }: FakeShots) {
  const uploaded: string[] = []
  const ran: string[] = []
  const analysis: AnalysisSandbox = {
    writeFiles: async (files) => {
      uploaded.push(...files.map((f) => f.path))
    },
    run: async (command) => {
      ran.push(command)
      const answer = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
      if (command.includes('-compose difference')) {
        return answer(command.includes('baseline.png') ? frame : runs)
      }
      if (command.includes('%[fx:mean]')) return answer(`${promptGrey} 0\n`)
      return { exitCode: 1, stdout: '', stderr: `unexpected command: ${command}` }
    },
    readPng: async (command) => {
      ran.push(command)
      const [, w, h] = /-(?:crop|resize) '?(\d+)x(\d+)/.exec(command) ?? []
      return pngOf(Number(w), Number(h), chunks)
    },
  }
  return { analysis, uploaded, ran }
}

const SHOT = new Uint8Array([1])
const RERUN = new Uint8Array([2])
const BASELINE = new Uint8Array([3])
const THEME = { shots: [SHOT, RERUN] as const, baseline: BASELINE }

/** The rectangles a comparison command blanks before it compares, as CSS [left, top, right, bottom]. */
const masks = (command: string | undefined) =>
  [...(command ?? '').matchAll(/rectangle (\d+),(\d+) (\d+),(\d+)/g)].map((m) => {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = m.slice(1).map(Number)
    return [x0 / SCALE, y0 / SCALE, (x1 + 1) / SCALE, (y1 + 1) / SCALE]
  })

describe('analyseTheme', () => {
  it('uploads both runs and the baseline into the fresh sandbox', async () => {
    const { analysis, uploaded } = fakeAnalysis({})

    await analyseTheme(analysis, { ...THEME, window: 'dark' })

    expect(uploaded).toEqual([
      '/home/user/.statuslines/shot.png',
      '/home/user/.statuslines/rerun.png',
      '/home/user/.statuslines/baseline.png',
    ])
  })

  it('returns the whole window and a card of it at one device pixel per CSS pixel, both re-encoded', async () => {
    const { analysis, ran } = fakeAnalysis({})

    const shot = await analyseTheme(analysis, { ...THEME, window: 'dark' })

    expect(shot).toMatchObject({
      width: 1100,
      height: 900,
      card: { width: 550, height: 450 },
    })
    const printed = ran.filter((command) => command.includes('png:-'))
    expect(printed).toHaveLength(2)
    for (const command of printed) {
      expect(command).toContain("'png:/home/user/.statuslines/shot.png[0]'")
      expect(command).toContain('-strip -define png:exclude-chunks=all')
    }
  })

  it('compares with the baseline only outside the turns, the prompt text and the scrollbar', async () => {
    const { analysis, ran } = fakeAnalysis({})

    await analyseTheme(analysis, { ...THEME, window: 'dark' })

    const frame = ran.find((c) => c.includes('-compose difference') && c.includes('baseline.png'))
    expect(masks(frame)).toEqual([
      [178, 37, 926, 816],
      [168, 818, 932, 858],
      [1088, 0, 1100, 900],
    ])
  })

  it.each(['dark', 'light'] as const)(
    'refuses a %s theme whose window looks the same as Desktop with no theme',
    async (window) => {
      const { analysis } = fakeAnalysis({
        frame: SAME,
        promptGrey: window === 'light' ? 0.97 : 0.1,
      })

      const refusal = analyseTheme(analysis, { ...THEME, window })

      await expect(refusal).rejects.toBeInstanceOf(DesktopThemeRefused)
      await expect(refusal).rejects.toThrow(
        `the theme didn't apply: the window looks the same as Desktop's own ${window} window`,
      )
    },
  )

  it.each([
    { window: 'dark' as const, promptGrey: 0.97, shown: 'light' },
    { window: 'light' as const, promptGrey: 0.05, shown: 'dark' },
  ])(
    'refuses a $window theme that showed a $shown window',
    async ({ window, promptGrey, shown }) => {
      const { analysis } = fakeAnalysis({ promptGrey })

      await expect(analyseTheme(analysis, { ...THEME, window })).rejects.toThrow(
        new DesktopThemeRefused(
          `the window is ${shown}, but the theme is made for a ${window} window`,
        ),
      )
    },
  )

  it('reads the window from the prompt box, which keeps the app’s own fill under a theme', async () => {
    const { analysis, ran } = fakeAnalysis({ promptGrey: 0.97 })

    await analyseTheme(analysis, { ...THEME, window: 'light' })

    expect(ran.find((c) => c.includes('%[fx:mean]'))).toContain('-crop 600x40+1200+1656')
  })

  it('refuses a theme whose two runs differ, leaving out only the prompt text', async () => {
    const { analysis, ran } = fakeAnalysis({ runs: CHANGED })

    await expect(analyseTheme(analysis, { ...THEME, window: 'dark' })).rejects.toThrow(
      new DesktopThemeRefused(
        'two recordings of the same commit differ, as a moving or random background would, so the still reviewed could differ from the one published',
      ),
    )
    const runs = ran.find((c) => c.includes('rerun.png') && c.includes('-compose difference'))
    expect(masks(runs)).toEqual([[168, 818, 932, 858]])
  })

  it('refuses a printed window that carries more than pixels', async () => {
    const { analysis } = fakeAnalysis({ chunks: ['IHDR', 'tEXt', 'IDAT', 'IEND'] })

    await expect(analyseTheme(analysis, { ...THEME, window: 'dark' })).rejects.toThrow(
      /more than pixels/,
    )
  })
})

describe('analyseWindow', () => {
  it('finds nothing when the window outside the turns matches the baseline', async () => {
    const { analysis } = fakeAnalysis({ frame: SAME })

    expect(await analyseWindow(analysis, { shot: SHOT, baseline: BASELINE })).toEqual({
      kind: 'nothing',
    })
  })

  it('returns the whole window and its card when the mod changed it', async () => {
    const { analysis, uploaded } = fakeAnalysis({})

    expect(await analyseWindow(analysis, { shot: SHOT, baseline: BASELINE })).toMatchObject({
      kind: 'shot',
      width: 1100,
      height: 900,
      card: { width: 550, height: 450 },
    })
    expect(uploaded).toEqual([
      '/home/user/.statuslines/shot.png',
      '/home/user/.statuslines/baseline.png',
    ])
  })
})
