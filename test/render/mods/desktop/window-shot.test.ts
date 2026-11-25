import { describe, expect, it } from 'vitest'
import type { AnalysisSandbox } from '@/render/mods/desktop/desktop-sandbox'
import { SCALE } from '@/render/mods/desktop/screen'
import { analyseTheme, analyseWindow, DesktopThemeRefused } from '@/render/mods/desktop/window-shot'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngOf(
  width: number,
  height: number,
  types = ['IHDR', 'IDAT', 'IEND'],
  pixelBytes = 3,
): Uint8Array {
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, width)
  new DataView(ihdr.buffer).setUint32(4, height)
  const chunks = types.map((type) => {
    const data = type === 'IHDR' ? ihdr : new Uint8Array(type === 'IEND' ? 0 : pixelBytes)
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

const LOOK = 'f'.repeat(64)
/** Desktop 6.28899.6's dark window: the prompt box's border (64/255), then the page (25/255). */
const LAID_OUT = '0.251 0\n0.098 0\n'
const MB = 1024 * 1024

interface FakeShots {
  /** What comparing the shot with Desktop's own window prints. */
  vsBaseline?: string
  /** What comparing the shot with the mod's own window with no switch steps prints. */
  vsModDefault?: string
  /** What comparing the two runs prints. */
  vsRerun?: string
  promptGrey?: number
  /** What probing Desktop's own window at the prompt box's left edge, then beside it, prints. */
  baselineEdge?: string
  chunks?: string[]
  /** Bytes of pixel data in the printed window and card. */
  windowBytes?: number
  cardBytes?: number
}

function fakeAnalysis({
  vsBaseline = CHANGED,
  vsModDefault = CHANGED,
  vsRerun = SAME,
  promptGrey = 0.1,
  baselineEdge = LAID_OUT,
  chunks,
  windowBytes = 3,
  cardBytes = 3,
}: FakeShots) {
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
        if (command.includes('baseline.png')) return answer(vsBaseline)
        if (command.includes('mod-default.png')) return answer(vsModDefault)
        return answer(vsRerun)
      }
      if (command.includes('%[fx:mean]') && command.includes('baseline.png')) {
        return answer(baselineEdge)
      }
      if (command.includes('%[fx:mean]')) return answer(`${promptGrey} 0\n`)
      if (command.includes("'%#'")) return answer(`${LOOK}\n`)
      return { exitCode: 1, stdout: '', stderr: `unexpected command: ${command}` }
    },
    readPng: async (command) => {
      ran.push(command)
      const [, w, h] = /-(?:crop|resize) '?(\d+)x(\d+)/.exec(command) ?? []
      const bytes = command.includes('-resize') ? cardBytes : windowBytes
      return pngOf(Number(w), Number(h), chunks, bytes)
    },
  }
  return { analysis, uploaded, ran }
}

const SHOT = new Uint8Array([1])
const RERUN = new Uint8Array([2])
const BASELINE = new Uint8Array([3])
const MOD_DEFAULT = new Uint8Array([4])
const THEME = { shots: [SHOT, RERUN] as const, baseline: BASELINE, modDefault: null }
const SWITCHED = { ...THEME, modDefault: MOD_DEFAULT }

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

  it('returns the whole window and a card of it at 880x720 device pixels, both re-encoded', async () => {
    const { analysis, ran } = fakeAnalysis({})

    const shot = await analyseTheme(analysis, { ...THEME, window: 'dark' })

    expect(shot).toMatchObject({
      width: 1100,
      height: 900,
      card: { width: 440, height: 360 },
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
        vsBaseline: SAME,
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

  it("fails, printing no shot, when Desktop's own window has no prompt box edge where the recorder expects it", async () => {
    // The chat column moved: page on both sides of where the prompt box's left border was.
    const { analysis, ran } = fakeAnalysis({ baselineEdge: '0.098 0\n0.098 0\n' })

    const failure = analyseTheme(analysis, { ...THEME, window: 'dark' })

    await expect(failure).rejects.toThrow(
      "Desktop's window isn't laid out as src/render/mods/desktop/screen.ts expects: its own window shows no prompt box edge at x=166. Re-measure screen.ts for this Desktop and run bun run smoke:desktop",
    )
    // Not a refusal of the theme, which would delete the shot an earlier Desktop recorded.
    await expect(failure).rejects.not.toBeInstanceOf(DesktopThemeRefused)
    expect(ran.some((c) => c.includes('png:-'))).toBe(false)
  })

  it("reads the layout from Desktop's own window, at the prompt box's left edge and the page beside it", async () => {
    const { analysis, ran } = fakeAnalysis({})

    await analyseTheme(analysis, { ...THEME, window: 'dark' })

    const probe = ran.find((c) => c.includes('%[fx:mean]') && c.includes('baseline.png'))
    expect(probe).toContain('-crop 2x28+332+1660')
    expect(probe).toContain('-crop 2x28+316+1660')
  })

  it("records a light theme when Desktop's light window has its prompt box edge in place", async () => {
    const { analysis } = fakeAnalysis({ promptGrey: 0.97, baselineEdge: '0.85 0\n0.98 0\n' })

    await expect(analyseTheme(analysis, { ...THEME, window: 'light' })).resolves.toMatchObject({
      look: LOOK,
    })
  })

  it('reads the window from the prompt box, which keeps the app’s own fill under a theme', async () => {
    const { analysis, ran } = fakeAnalysis({ promptGrey: 0.97 })

    await analyseTheme(analysis, { ...THEME, window: 'light' })

    const probe = ran.find((c) => c.includes('%[fx:mean]') && c.includes('shot.png'))
    expect(probe).toContain('-crop 600x40+1200+1656')
  })

  it('refuses a theme whose two runs differ, leaving out only the prompt text', async () => {
    const { analysis, ran } = fakeAnalysis({ vsRerun: CHANGED })

    await expect(analyseTheme(analysis, { ...THEME, window: 'dark' })).rejects.toThrow(
      new DesktopThemeRefused(
        'two recordings of the same commit differ, as a moving or random background would, so the still reviewed could differ from the one published',
      ),
    )
    const runs = ran.find((c) => c.includes('rerun.png') && c.includes('-compose difference'))
    expect(masks(runs)).toEqual([[168, 818, 932, 858]])
  })

  it("refuses a theme whose switch steps leave the mod's own window as it was", async () => {
    const { analysis, uploaded, ran } = fakeAnalysis({ vsModDefault: SAME })

    await expect(analyseTheme(analysis, { ...SWITCHED, window: 'dark' })).rejects.toThrow(
      new DesktopThemeRefused(
        "the switch steps didn't change the window: it looks the same as the mod's own window with no switch steps (a theme the mod sets on its own takes no switch steps)",
      ),
    )
    expect(uploaded).toContain('/home/user/.statuslines/mod-default.png')
    const compared = ran.find((c) => c.includes('mod-default.png'))
    expect(masks(compared)).toEqual([
      [178, 37, 926, 816],
      [168, 818, 932, 858],
      [1088, 0, 1100, 900],
    ])
  })

  it('compares with no mod default for a theme the mod sets on its own', async () => {
    const { analysis, uploaded, ran } = fakeAnalysis({ vsModDefault: SAME })

    await analyseTheme(analysis, { ...THEME, window: 'dark' })

    expect(uploaded).not.toContain('/home/user/.statuslines/mod-default.png')
    expect(ran.some((c) => c.includes('mod-default.png'))).toBe(false)
  })

  it('names the look by a hash of the window outside the turns', async () => {
    const { analysis, ran } = fakeAnalysis({})

    const shot = await analyseTheme(analysis, { ...SWITCHED, window: 'dark' })

    expect(shot.look).toBe(LOOK)
    const look = ran.find((c) => c.includes("'%#'"))
    expect(look).toContain("'png:/home/user/.statuslines/shot.png[0]'")
    expect(masks(look)).toEqual([
      [178, 37, 926, 816],
      [168, 818, 932, 858],
      [1088, 0, 1100, 900],
    ])
  })

  it.each([
    { what: 'window shot', windowBytes: 4 * MB + 1, cardBytes: 3, size: '4.0 MB, over the 4.0' },
    { what: 'card image', windowBytes: 3, cardBytes: MB + 1, size: '1.0 MB, over the 1.0' },
  ])('refuses a $what over its size cap', async ({ what, windowBytes, cardBytes, size }) => {
    const { analysis } = fakeAnalysis({ windowBytes, cardBytes })

    await expect(analyseTheme(analysis, { ...THEME, window: 'dark' })).rejects.toThrow(
      new DesktopThemeRefused(`the ${what} is ${size} MB a theme's preview may take`),
    )
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
    const { analysis } = fakeAnalysis({ vsBaseline: SAME })

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
      card: { width: 440, height: 360 },
    })
    expect(uploaded).toEqual([
      '/home/user/.statuslines/shot.png',
      '/home/user/.statuslines/baseline.png',
    ])
  })
})
