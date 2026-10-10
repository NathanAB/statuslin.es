import type { DrawLocation } from '@/mods/footprint'
import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import type { AnalysisSandbox } from './desktop-sandbox'
import { frameShot, readLayout } from './framing'
import {
  changedBoxCommand,
  croppedPngCommand,
  parseChangedBox,
  parseProbes,
  probeCommand,
} from './imagemagick'
import { expectOk } from './interact'
import { checkedPixelPng } from './png'
import { BORDER_PROBES, PROMPT_TEXT, SCALE } from './screen'
import type { DesktopShot } from './types'

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
  | ({ kind: 'shot' } & Pick<DesktopShot, 'png' | 'width' | 'height' | 'cardAnchor'>)

async function layoutOf(analysis: AnalysisSandbox, path: string): Promise<'chat' | 'pane'> {
  const regions = [BORDER_PROBES.prompt, BORDER_PROBES.promptBesidePane, BORDER_PROBES.pane]
  const command = probeCommand(path, regions, { capture: false })
  const { stdout } = expectOk(await analysis.run(command), 'reading the layout')
  const [prompt, promptBesidePane, pane] = parseProbes(stdout, regions.length)
  if (!prompt || !promptBesidePane || !pane) throw new Error('missing layout probes')
  return readLayout({ prompt, promptBesidePane, pane })
}

/**
 * Frames a mod's final shot against the baseline in a fresh sandbox no mod code has run in, and
 * returns the crop re-encoded from its pixels alone, checked to hold nothing else.
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
  const changed = paneOpen
    ? null
    : parseChangedBox(
        expectOk(
          await analysis.run(changedBoxCommand(BASELINE, SHOT, PROMPT_TEXT)),
          'comparing with the baseline',
        ).stdout,
      )
  const frame = frameShot({ changed, paneOpen, draws })
  if (frame.kind === 'nothing') return { kind: 'nothing' }
  const { width, height } = frame.rect
  const png = checkedPixelPng(await analysis.readPng(croppedPngCommand(SHOT, frame.rect)), {
    width: width * SCALE,
    height: height * SCALE,
  })
  return { kind: 'shot', png, width, height, cardAnchor: frame.cardAnchor }
}
