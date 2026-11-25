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
import { maskedSignatureCommand, parseSignature } from './look-signature'
import { checkedPixelPng } from './png'
import {
  MESSAGE_AREA,
  PROMPT_EDGE_PROBES,
  PROMPT_FILL,
  PROMPT_TEXT,
  type Rect,
  SCALE,
  SCROLL_GUTTER,
  WINDOW,
} from './screen'
import { BASELINE, SHOT } from './shot-reads'
import type { DesktopShot, DesktopThemeShot } from './types'

const RERUN = `${SANDBOX_WORK_DIR}/rerun.png`
const MOD_DEFAULT = `${SANDBOX_WORK_DIR}/mod-default.png`
const WHOLE: Rect = { x: 0, y: 0, ...WINDOW }
const CARD_SCALE = 0.4
const CARD = {
  width: WINDOW.width * SCALE * CARD_SCALE,
  height: WINDOW.height * SCALE * CARD_SCALE,
}
const LIGHT_FILL = 0.5
/**
 * Under this, the prompt box's border reads as the page beside it. Desktop's dark window has them 39
 * grey levels (0.15) apart.
 */
const EDGE_CONTRAST = 0.03
/** Where the session's turns show, which differ between themes of one look. */
const TURNS: Rect[] = [MESSAGE_AREA, PROMPT_TEXT, SCROLL_GUTTER]
const MB = 1024 * 1024
/**
 * The largest a theme's window and card may be. The 8 themes first recorded came to 0.7-2.5 MB
 * a window and 0.22-0.50 MB a card; a pack of 38 themes with twins at the caps stays under 200 MB.
 */
const THEME_SHOT_MAX_BYTES = 4 * MB
const THEME_CARD_MAX_BYTES = 1 * MB

export class DesktopThemeRefused extends Error {
  override name = 'DesktopThemeRefused'
}

export type WindowShot = Pick<DesktopShot, 'png' | 'width' | 'height' | 'card'>

export type ThemeWindowShot = Pick<DesktopThemeShot, 'png' | 'width' | 'height' | 'card' | 'look'>

async function differs(
  analysis: AnalysisSandbox,
  [from, to]: [string, string],
  masks: Rect[],
  what: string,
): Promise<boolean> {
  const { stdout } = expectOk(await analysis.run(changedBoxCommand(from, to, masks)), what)
  return parseChangedBox(stdout) !== null
}

const changedOutsideTurns = (analysis: AnalysisSandbox, from = BASELINE) =>
  differs(analysis, [from, SHOT], TURNS, `comparing with ${from}`)

async function shownWindow(analysis: AnalysisSandbox): Promise<ThemeWindow> {
  const probe = probeCommand(SHOT, [PROMPT_FILL], { capture: false })
  const { stdout } = expectOk(await analysis.run(probe), 'reading the prompt box')
  const [fill] = parseProbes(stdout, 1)
  if (!fill) throw new Error('missing the prompt box probe')
  return fill.mean > LIGHT_FILL ? 'light' : 'dark'
}

/**
 * Throws when Desktop's own window has no prompt box edge where screen.ts puts it: Desktop moved its
 * chat column, so the masks that leave out the turns cover the wrong place and the theme checks
 * mean nothing. Not a refusal of the theme: the recorder is what needs fixing.
 */
async function checkLayout(analysis: AnalysisSandbox): Promise<void> {
  const { edge, page } = PROMPT_EDGE_PROBES
  const probe = probeCommand(BASELINE, [edge, page], { capture: false })
  const { stdout } = expectOk(await analysis.run(probe), "reading Desktop's own window")
  const [edgeGrey, pageGrey] = parseProbes(stdout, 2)
  if (!edgeGrey || !pageGrey) throw new Error('missing the prompt box edge probes')
  if (Math.abs(edgeGrey.mean - pageGrey.mean) < EDGE_CONTRAST) {
    throw new Error(
      `Desktop's window isn't laid out as src/render/mods/desktop/screen.ts expects: its own window shows no prompt box edge at x=${edge.x}. Re-measure screen.ts for this Desktop and run bun run smoke:desktop`,
    )
  }
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
  /**
   * For a theme with switch steps, the mod's own window with no steps, in the theme's window; null
   * for a theme the mod sets on its own. Untrusted.
   */
  modDefault: Uint8Array | null
  window: ThemeWindow
}

function underCap(png: Uint8Array, max: number, what: string): Uint8Array {
  if (png.length <= max) return png
  const mb = (bytes: number) => (bytes / MB).toFixed(1)
  throw new DesktopThemeRefused(
    `the ${what} is ${mb(png.length)} MB, over the ${mb(max)} MB a theme's preview may take`,
  )
}

/**
 * A Desktop theme's preview: the first run's whole window. Fails when Desktop's own window isn't
 * laid out as screen.ts expects. Refused when the theme didn't apply
 * (nothing outside the turns changed), when the window shows the other light or dark than the theme
 * is made for, or when the two runs differ.
 */
export async function analyseTheme(
  analysis: AnalysisSandbox,
  { shots: [shot, rerun], baseline, modDefault, window }: ThemeShots,
): Promise<ThemeWindowShot> {
  await analysis.writeFiles([
    { path: SHOT, data: shot },
    { path: RERUN, data: rerun },
    { path: BASELINE, data: baseline },
    ...(modDefault ? [{ path: MOD_DEFAULT, data: modDefault }] : []),
  ])
  await checkLayout(analysis)
  if (!(await changedOutsideTurns(analysis))) {
    throw new DesktopThemeRefused(
      `the theme didn't apply: the window looks the same as Desktop's own ${window} window`,
    )
  }
  if (modDefault && !(await changedOutsideTurns(analysis, MOD_DEFAULT))) {
    throw new DesktopThemeRefused(
      "the switch steps didn't change the window: it looks the same as the mod's own window with no switch steps (a theme the mod sets on its own takes no switch steps)",
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
  const { png, card, ...size } = await wholeWindow(analysis)
  const { stdout } = expectOk(
    await analysis.run(maskedSignatureCommand(SHOT, TURNS)),
    'reading the look',
  )
  return {
    png: underCap(png, THEME_SHOT_MAX_BYTES, 'window shot'),
    card: { ...card, png: underCap(card.png, THEME_CARD_MAX_BYTES, 'card image') },
    ...size,
    look: parseSignature(stdout),
  }
}
