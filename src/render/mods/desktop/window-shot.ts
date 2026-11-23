import type { ThemeWindow } from '@/themes/theme'
import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import type { Analysis } from './analyse'
import type { AnalysisSandbox } from './desktop-sandbox'
import {
  changedBoxCommand,
  croppedPngCommand,
  parseChangedBox,
  parseProbes,
  probeCommand,
  scaledPngCommand,
} from './imagemagick'
import { expectOk } from './interact'
import { checkedPixelPng } from './png'
import {
  MESSAGE_AREA,
  PROMPT_FILL,
  PROMPT_TEXT,
  type Rect,
  SCALE,
  SCROLL_GUTTER,
  WINDOW,
} from './screen'
import { BASELINE, SHOT } from './shot-reads'
import type { DesktopShot } from './types'

const RERUN = `${SANDBOX_WORK_DIR}/rerun.png`
const WHOLE: Rect = { x: 0, y: 0, ...WINDOW }
const CARD = { width: 880, height: 720 }
const LIGHT_FILL = 0.5

export class DesktopThemeRefused extends Error {
  override name = 'DesktopThemeRefused'
}

export type WindowShot = Pick<DesktopShot, 'png' | 'width' | 'height' | 'card'>

async function differs(
  analysis: AnalysisSandbox,
  [from, to]: [string, string],
  masks: Rect[],
  what: string,
): Promise<boolean> {
  const { stdout } = expectOk(await analysis.run(changedBoxCommand(from, to, masks)), what)
  return parseChangedBox(stdout) !== null
}

const changedOutsideTurns = (analysis: AnalysisSandbox) =>
  differs(
    analysis,
    [BASELINE, SHOT],
    [MESSAGE_AREA, PROMPT_TEXT, SCROLL_GUTTER],
    "comparing with Desktop's own window",
  )

async function shownWindow(analysis: AnalysisSandbox): Promise<ThemeWindow> {
  const probe = probeCommand(SHOT, [PROMPT_FILL], { capture: false })
  const { stdout } = expectOk(await analysis.run(probe), 'reading the prompt box')
  const [fill] = parseProbes(stdout, 1)
  if (!fill) throw new Error('missing the prompt box probe')
  return fill.mean > LIGHT_FILL ? 'light' : 'dark'
}

async function wholeWindow(analysis: AnalysisSandbox): Promise<WindowShot> {
  const png = checkedPixelPng(await analysis.readPng(croppedPngCommand(SHOT, WHOLE)), {
    width: WINDOW.width * SCALE,
    height: WINDOW.height * SCALE,
  })
  const card = checkedPixelPng(await analysis.readPng(scaledPngCommand(SHOT, CARD)), CARD)
  return {
    png,
    ...WINDOW,
    card: { png: card, width: CARD.width / SCALE, height: CARD.height / SCALE },
  }
}

/**
 * A theme mod's own preview: its whole window, or nothing when the window outside the session's
 * turns looks the same as the same session's with no mod.
 */
export async function analyseWindow(
  analysis: AnalysisSandbox,
  { shot, baseline }: { shot: Uint8Array; baseline: Uint8Array },
): Promise<Analysis> {
  await analysis.writeFiles([
    { path: SHOT, data: shot },
    { path: BASELINE, data: baseline },
  ])
  if (!(await changedOutsideTurns(analysis))) return { kind: 'nothing' }
  return { kind: 'shot', ...(await wholeWindow(analysis)) }
}

export interface ThemeShots {
  /** Two recordings of the same theme at the same commit, each in its own sandbox. Untrusted. */
  shots: readonly [Uint8Array, Uint8Array]
  /** Desktop with no mod and no steps, in the theme's window. */
  baseline: Uint8Array
  window: ThemeWindow
}

/**
 * A Desktop theme's preview: the first run's whole window. Refused when the theme didn't apply
 * (nothing outside the turns changed), when the window shows the other light or dark than the theme
 * is made for, or when the two runs differ.
 */
export async function analyseTheme(
  analysis: AnalysisSandbox,
  { shots: [shot, rerun], baseline, window }: ThemeShots,
): Promise<WindowShot> {
  await analysis.writeFiles([
    { path: SHOT, data: shot },
    { path: RERUN, data: rerun },
    { path: BASELINE, data: baseline },
  ])
  if (!(await changedOutsideTurns(analysis))) {
    throw new DesktopThemeRefused(
      `the theme didn't apply: the window looks the same as Desktop's own ${window} window`,
    )
  }
  const shown = await shownWindow(analysis)
  if (shown !== window) {
    throw new DesktopThemeRefused(
      `the window is ${shown}, but the theme is made for a ${window} window`,
    )
  }
  if (await differs(analysis, [SHOT, RERUN], [PROMPT_TEXT], 'comparing the two runs')) {
    throw new DesktopThemeRefused(
      'two recordings of the same commit differ, as a moving or random background would, so the still reviewed could differ from the one published',
    )
  }
  return wholeWindow(analysis)
}
