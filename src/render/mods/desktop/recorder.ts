import type { InputStep } from '@/mods/curation'
import type { DrawLocation } from '@/mods/footprint'
import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import { type DesktopSandbox, withDesktopSandbox } from './desktop-sandbox'
import {
  type DesktopVersions,
  driveSession,
  FINAL_SHOT,
  MAX_INPUT_STEPS,
  MAX_STEP_CHARS,
} from './drive'
import { type Frame, frameShot, readLayout } from './framing'
import {
  changedBoxCommand,
  cropCommand,
  parseChangedBox,
  parseProbes,
  probeCommand,
} from './imagemagick'
import { expectOk } from './interact'
import { checkedPng, PNG_MAX_BYTES } from './png'
import { BORDER_PROBES, PROMPT_TEXT, type Rect, SCALE, WINDOW } from './screen'
import type { DesktopRecorder, DesktopRecording } from './types'

const BASELINE_SHOT = `${SANDBOX_WORK_DIR}/baseline.png`
const CROPPED_SHOT = `${SANDBOX_WORK_DIR}/crop.png`
const FULL_SHOT = { width: WINDOW.width * SCALE, height: WINDOW.height * SCALE }

export interface DesktopBaseline extends DesktopVersions {
  /** The full final shot of the session with no mod. */
  png: Uint8Array
}

interface Sandboxes {
  withDesktopSandbox: typeof withDesktopSandbox
}

/** One shared run of `make` for every caller; a failure is not kept, so the next caller retries. */
export function sharedOnce<T>(make: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    pending ??= make().catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
}

function checkInputSteps(steps: readonly InputStep[]): void {
  if (steps.length > MAX_INPUT_STEPS) {
    throw new Error(
      `${steps.length} input steps cannot finish inside the sandbox lifetime; at most ${MAX_INPUT_STEPS} can`,
    )
  }
  const long = steps.find((step) => [...step.text].length > MAX_STEP_CHARS)
  if (long) throw new Error(`an input step is over ${MAX_STEP_CHARS} characters`)
}

async function layoutOf(sandbox: DesktopSandbox): Promise<'chat' | 'pane'> {
  const regions = [BORDER_PROBES.prompt, BORDER_PROBES.promptBesidePane, BORDER_PROBES.pane]
  const command = probeCommand(FINAL_SHOT, regions, { capture: false })
  const { stdout } = expectOk(await sandbox.run(command), 'reading the layout')
  const [prompt, promptBesidePane, pane] = parseProbes(stdout, regions.length)
  if (!prompt || !promptBesidePane || !pane) throw new Error('missing layout probes')
  return readLayout({ prompt, promptBesidePane, pane })
}

async function recordBaseline({ withDesktopSandbox }: Sandboxes): Promise<DesktopBaseline> {
  return withDesktopSandbox(null, async (sandbox) => {
    const versions = await driveSession(sandbox, { target: null, inputSteps: [] })
    if ((await layoutOf(sandbox)) !== 'chat') throw new Error('the baseline shows a pane')
    const png = checkedPng(await sandbox.readFile(FINAL_SHOT, PNG_MAX_BYTES), FULL_SHOT)
    return { ...versions, png }
  })
}

async function frameInSandbox(
  sandbox: DesktopSandbox,
  baseline: DesktopBaseline,
  draws: readonly DrawLocation[],
): Promise<Frame> {
  const paneOpen = (await layoutOf(sandbox)) === 'pane'
  if (paneOpen) return frameShot({ changed: null, paneOpen, draws })
  await sandbox.writeFiles([{ path: BASELINE_SHOT, data: baseline.png }])
  const compare = changedBoxCommand(BASELINE_SHOT, FINAL_SHOT, PROMPT_TEXT)
  const { stdout } = expectOk(await sandbox.run(compare), 'comparing with the baseline')
  return frameShot({ changed: parseChangedBox(stdout), paneOpen, draws })
}

async function croppedPng(sandbox: DesktopSandbox, rect: Rect): Promise<Uint8Array> {
  expectOk(await sandbox.run(cropCommand(FINAL_SHOT, rect, CROPPED_SHOT)), 'cropping the shot')
  const bytes = await sandbox.readFile(CROPPED_SHOT, PNG_MAX_BYTES)
  return checkedPng(bytes, { width: rect.width * SCALE, height: rect.height * SCALE })
}

const sameVersions = (a: DesktopVersions, b: DesktopVersions) =>
  a.desktopVersion === b.desktopVersion && a.engineVersion === b.engineVersion

/**
 * Records mods in the real Claude Desktop, each in its own cold-booted sandbox, and frames each
 * final shot against one no-mod baseline shared by every record on this instance.
 */
export function desktopRecorder(
  sandboxes: Sandboxes,
): DesktopRecorder & { baseline(): Promise<DesktopBaseline> } {
  const baseline = sharedOnce(() => recordBaseline(sandboxes))
  return {
    baseline,
    record: async ({ mod, inputSteps, draws }): Promise<DesktopRecording> => {
      checkInputSteps(inputSteps)
      // Started now, alongside the mod's session; awaited only to frame its shot.
      const pendingBaseline = baseline()
      pendingBaseline.catch(() => {})
      return sandboxes.withDesktopSandbox(mod.source, async (sandbox) => {
        const versions = await driveSession(sandbox, { target: mod.pluginName, inputSteps })
        const base = await pendingBaseline
        if (!sameVersions(versions, base)) {
          throw new Error(
            `the baseline ran Desktop ${base.desktopVersion} (engine ${base.engineVersion}) but the mod ran ${versions.desktopVersion} (engine ${versions.engineVersion})`,
          )
        }
        const frame = await frameInSandbox(sandbox, base, draws)
        if (frame.kind === 'nothing') return { kind: 'nothing', ...versions }
        const png = await croppedPng(sandbox, frame.rect)
        const { width, height } = frame.rect
        return { kind: 'shot', png, width, height, cardAnchor: frame.cardAnchor, ...versions }
      })
    },
  }
}

export const e2bDesktopRecorder = (): DesktopRecorder => desktopRecorder({ withDesktopSandbox })
