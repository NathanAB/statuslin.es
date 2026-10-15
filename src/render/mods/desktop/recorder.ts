import type { InputStep } from '@/mods/curation'
import type { ModSource } from '../mod-sandbox'
import { analyseShot } from './analyse'
import {
  type DesktopVersions,
  E2B_DESKTOP_SANDBOXES,
  type withAnalysisSandbox,
  type withRecordingDesktop,
} from './desktop-sandbox'
import {
  type DriveRequest,
  driveSession,
  MAX_INPUT_STEPS,
  MAX_STEP_CHARS,
  sessionUploads,
} from './drive'
import { SCREEN_PNG_COMMAND } from './imagemagick'
import { checkedPng } from './png'
import { SCALE, WINDOW } from './screen'
import type { DesktopRecorder, DesktopRecording } from './types'

const FULL_SHOT = { width: WINDOW.width * SCALE, height: WINDOW.height * SCALE }

/** A session's full final shot as its sandbox printed it, and the versions read before it ran. */
export interface FullShot extends DesktopVersions {
  png: Uint8Array
}

interface Sandboxes {
  withRecordingDesktop: typeof withRecordingDesktop
  withAnalysisSandbox: typeof withAnalysisSandbox
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

/**
 * Records one session and prints its full final shot out of the sandbox, which is killed before
 * anything looks at the pixels.
 */
function recordFullShot(
  { withRecordingDesktop }: Sandboxes,
  source: ModSource | null,
  request: DriveRequest,
): Promise<FullShot> {
  const setup = { source, files: (versions: DesktopVersions) => sessionUploads(request, versions) }
  return withRecordingDesktop(setup, async (desktop, versions) => {
    await driveSession(desktop, request.inputSteps)
    const png = checkedPng(await desktop.readPng(SCREEN_PNG_COMMAND), FULL_SHOT)
    return { ...versions, png }
  })
}

const sameVersions = (a: DesktopVersions, b: DesktopVersions) =>
  a.desktopVersion === b.desktopVersion && a.engineVersion === b.engineVersion

/**
 * Records mods in the real Claude Desktop, each in its own cold-booted sandbox, and frames each
 * final shot against one no-mod baseline shared by every record on this instance. The framing and
 * crop run in a second, fresh sandbox, as the terminal recorder's replay does.
 */
export function desktopRecorder(
  sandboxes: Sandboxes,
): DesktopRecorder & { baseline(): Promise<FullShot> } {
  const baseline = sharedOnce(() =>
    recordFullShot(sandboxes, null, { target: null, inputSteps: [] }),
  )
  return {
    baseline,
    record: async ({ mod, inputSteps, draws }): Promise<DesktopRecording> => {
      checkInputSteps(inputSteps)
      // Started now, alongside the mod's session; awaited only to frame its shot.
      const pendingBaseline = baseline()
      pendingBaseline.catch(() => {})
      const shot = await recordFullShot(sandboxes, mod.source, {
        target: mod.pluginName,
        inputSteps,
      })
      const base = await pendingBaseline
      const versions = { desktopVersion: shot.desktopVersion, engineVersion: shot.engineVersion }
      if (!sameVersions(versions, base)) {
        throw new Error(
          `the baseline ran Desktop ${base.desktopVersion} (engine ${base.engineVersion}) but the mod ran ${versions.desktopVersion} (engine ${versions.engineVersion})`,
        )
      }
      const analysis = await sandboxes.withAnalysisSandbox((sandbox) =>
        analyseShot(sandbox, { shot: shot.png, baseline: base.png, draws }),
      )
      return { ...analysis, ...versions }
    },
  }
}

export const e2bDesktopRecorder = (): DesktopRecorder => desktopRecorder(E2B_DESKTOP_SANDBOXES)
