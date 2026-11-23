import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import type { AnalysisSandbox } from './desktop-sandbox'
import { readLayout, readScrolled } from './framing'
import { parseProbes, parseRowProfile, probeCommand, rowProfileCommand } from './imagemagick'
import { expectOk } from './interact'
import type { RowProfile } from './rows'
import { BORDER_PROBES, type Column, SCROLLBAR_FOOT, WINDOW } from './screen'

export const SHOT = `${SANDBOX_WORK_DIR}/shot.png`
export const BASELINE = `${SANDBOX_WORK_DIR}/baseline.png`

export async function layoutOf(
  analysis: AnalysisSandbox,
  path: string,
): Promise<{ layout: 'chat' | 'pane'; scrolled: boolean }> {
  const { prompt, promptBesidePane, pane } = BORDER_PROBES
  const regions = [prompt, promptBesidePane, pane, SCROLLBAR_FOOT]
  const command = probeCommand(path, regions, { capture: false })
  const { stdout } = expectOk(await analysis.run(command), 'reading the layout')
  const [promptGrey, besidePaneGrey, paneGrey, footGrey] = parseProbes(stdout, regions.length)
  if (!promptGrey || !besidePaneGrey || !paneGrey || !footGrey) {
    throw new Error('missing layout probes')
  }
  return {
    layout: readLayout({ prompt: promptGrey, promptBesidePane: besidePaneGrey, pane: paneGrey }),
    scrolled: readScrolled(footGrey),
  }
}

export async function rowProfile(
  analysis: AnalysisSandbox,
  columns: Column[],
  path = SHOT,
): Promise<RowProfile> {
  const { stdout } = expectOk(
    await analysis.run(rowProfileCommand(path, columns)),
    'reading the shot row by row',
  )
  return parseRowProfile(stdout, WINDOW.height)
}
