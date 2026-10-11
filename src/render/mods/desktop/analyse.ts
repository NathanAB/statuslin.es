import type { DrawLocation } from '@/mods/footprint'
import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import type { AnalysisSandbox } from './desktop-sandbox'
import { frameShot, readLayout } from './framing'
import {
  changedBoxCommand,
  croppedPngCommand,
  parseChangedBox,
  parseProbes,
  parseRowProfile,
  probeCommand,
  rowProfileCommand,
} from './imagemagick'
import { expectOk } from './interact'
import { checkedPixelPng } from './png'
import type { RowProfile } from './rows'
import {
  BORDER_PROBES,
  CHAT_COLUMN,
  type Column,
  PANE_CHAT_COLUMN,
  PROMPT_TEXT,
  plateStrips,
  type Rect,
  SCALE,
  SCROLL_GUTTER,
  WINDOW,
} from './screen'
import type { DesktopImage, DesktopShot } from './types'

const SHOT = `${SANDBOX_WORK_DIR}/shot.png`
const BASELINE = `${SANDBOX_WORK_DIR}/baseline.png`

export interface ShotsToAnalyse {
  /** The mod session's full final shot, as printed by its sandbox. Untrusted. */
  shot: Uint8Array
  /** The no-mod session's full final shot. */
  baseline: Uint8Array
  draws: readonly DrawLocation[]
}

export type Analysis =
  | { kind: 'nothing' }
  | ({ kind: 'shot' } & Pick<DesktopShot, 'png' | 'width' | 'height' | 'card'>)

async function layoutOf(analysis: AnalysisSandbox, path: string): Promise<'chat' | 'pane'> {
  const regions = [BORDER_PROBES.prompt, BORDER_PROBES.promptBesidePane, BORDER_PROBES.pane]
  const command = probeCommand(path, regions, { capture: false })
  const { stdout } = expectOk(await analysis.run(command), 'reading the layout')
  const [prompt, promptBesidePane, pane] = parseProbes(stdout, regions.length)
  if (!prompt || !promptBesidePane || !pane) throw new Error('missing layout probes')
  return readLayout({ prompt, promptBesidePane, pane })
}

async function rowProfile(analysis: AnalysisSandbox, columns: Column[]): Promise<RowProfile> {
  const { stdout } = expectOk(
    await analysis.run(rowProfileCommand(SHOT, columns)),
    'reading the shot row by row',
  )
  return parseRowProfile(stdout, WINDOW.height)
}

async function changedBox(analysis: AnalysisSandbox): Promise<Rect | null> {
  const compare = changedBoxCommand(BASELINE, SHOT, [PROMPT_TEXT, SCROLL_GUTTER])
  return parseChangedBox(
    expectOk(await analysis.run(compare), 'comparing with the baseline').stdout,
  )
}

/** The crop, re-encoded from its pixels alone and checked to hold nothing else. */
async function cropped(analysis: AnalysisSandbox, rect: Rect): Promise<DesktopImage> {
  const png = checkedPixelPng(await analysis.readPng(croppedPngCommand(SHOT, rect)), {
    width: rect.width * SCALE,
    height: rect.height * SCALE,
  })
  return { png, width: rect.width, height: rect.height }
}

/**
 * Frames a mod's final shot against the baseline in a fresh sandbox no mod code has run in, and
 * returns the page crop and the card crop, each re-encoded from its pixels alone.
 */
export async function analyseShot(
  analysis: AnalysisSandbox,
  { shot, baseline, draws }: ShotsToAnalyse,
): Promise<Analysis> {
  await analysis.writeFiles([
    { path: SHOT, data: shot },
    { path: BASELINE, data: baseline },
  ])
  if ((await layoutOf(analysis, BASELINE)) !== 'chat') throw new Error('the baseline shows a pane')
  const paneOpen = (await layoutOf(analysis, SHOT)) === 'pane'
  const changed = paneOpen ? null : await changedBox(analysis)
  if (!paneOpen && !changed) return { kind: 'nothing' }
  const column = paneOpen ? PANE_CHAT_COLUMN : CHAT_COLUMN
  const frame = frameShot({
    changed,
    paneOpen,
    draws,
    rows: await rowProfile(analysis, [column]),
    plate: await rowProfile(analysis, plateStrips(column)),
  })
  if (frame.kind === 'nothing') return { kind: 'nothing' }
  const page = await cropped(analysis, frame.rect)
  return { kind: 'shot', ...page, card: await cropped(analysis, frame.card) }
}
