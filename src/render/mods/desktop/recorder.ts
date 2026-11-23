import { type InputStep, MAX_STEP_CHARS, type TextStep } from '@/mods/curation'
import type { ThemeWindow } from '@/themes/theme'
import type { ModSource } from '../mod-sandbox'
import type { ModUnderRender } from '../recorder'
import { analyseShot } from './analyse'
import {
  type DesktopVersions,
  E2B_DESKTOP_SANDBOXES,
  type withAnalysisSandbox,
  type withRecordingDesktop,
} from './desktop-sandbox'
import { type DriveRequest, driveSession, MAX_INPUT_STEPS, sessionUploads } from './drive'
import { SCREEN_PNG_COMMAND } from './imagemagick'
import { checkedPng } from './png'
import { SCALE, WINDOW } from './screen'
import { desktopSessionNetwork, type SessionNetwork } from './session'
import type { DesktopRecorder, DesktopRecording, DesktopThemeRequest } from './types'
import { analyseTheme, analyseWindow } from './window-shot'

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

function checkInputSteps(steps: readonly TextStep[]): void {
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
  network: SessionNetwork = desktopSessionNetwork(undefined),
): Promise<FullShot> {
  const setup = {
    source,
    files: (versions: DesktopVersions) => sessionUploads(request, versions),
    ...network,
  }
  return withRecordingDesktop(setup, async (desktop, versions) => {
    await driveSession(desktop, request.inputSteps, request.window)
    const png = checkedPng(await desktop.readPng(SCREEN_PNG_COMMAND), FULL_SHOT)
    return { ...versions, png }
  })
}

/** A click names a terminal cell, which is nowhere in the Desktop window: Desktop types the rest. */
const desktopSteps = (steps: readonly InputStep[]): TextStep[] =>
  steps.filter((step) => step.type === 'text')

const sameVersions = (a: DesktopVersions, b: DesktopVersions) =>
  a.desktopVersion === b.desktopVersion && a.engineVersion === b.engineVersion

const versionsOf = ({ desktopVersion, engineVersion }: DesktopVersions): DesktopVersions => ({
  desktopVersion,
  engineVersion,
})

function checkSameVersions(base: DesktopVersions, ran: DesktopVersions, what: string): void {
  if (!sameVersions(base, ran)) {
    throw new Error(
      `the baseline ran Desktop ${base.desktopVersion} (engine ${base.engineVersion}) but the ${what} ran ${ran.desktopVersion} (engine ${ran.engineVersion})`,
    )
  }
}

const switchInputSteps = (switchSteps: readonly string[]): TextStep[] =>
  switchSteps.map((text) => ({ type: 'text', text }))

/**
 * Records mods in the real Claude Desktop, each in its own cold-booted sandbox, and frames each
 * final shot against a no-mod baseline that types the same input steps, so the turns they start
 * frame away. One baseline per window and list of steps, shared by every record on this instance.
 * The framing and crop run in a second, fresh sandbox, as the terminal recorder's replay does.
 *
 * A mod that sets a theme recolors the whole window, so its own preview is the whole window. Each
 * of its Desktop themes is recorded twice in the theme's own window, after the steps that switch to
 * it, and checked against Desktop's own window with no mod and no steps.
 */
export function desktopRecorder(
  sandboxes: Sandboxes,
): DesktopRecorder & { baseline(inputSteps: readonly InputStep[]): Promise<FullShot> } {
  const bySetup = new Map<string, () => Promise<FullShot>>()
  const byModDefault = new WeakMap<ModUnderRender, Map<ThemeWindow, () => Promise<FullShot>>>()
  /** The mod with no steps in `window`: a theme's switch steps have to change it. One per mod. */
  const modDefault = (mod: ModUnderRender, window: ThemeWindow) => {
    const byWindow = byModDefault.get(mod) ?? new Map<ThemeWindow, () => Promise<FullShot>>()
    byModDefault.set(mod, byWindow)
    const shared =
      byWindow.get(window) ??
      sharedOnce(() =>
        recordFullShot(sandboxes, mod.source, { target: mod.pluginName, inputSteps: [], window }),
      )
    byWindow.set(window, shared)
    return shared()
  }
  const textBaseline = (inputSteps: readonly TextStep[], window: ThemeWindow = 'dark') => {
    const key = JSON.stringify([window, inputSteps])
    const shared =
      bySetup.get(key) ??
      sharedOnce(() => recordFullShot(sandboxes, null, { target: null, inputSteps, window }))
    bySetup.set(key, shared)
    return shared()
  }
  return {
    baseline: (inputSteps) => textBaseline(desktopSteps(inputSteps)),
    recordTheme: async ({ mod, window, switchSteps }: DesktopThemeRequest) => {
      const inputSteps = switchInputSteps(switchSteps)
      checkInputSteps(inputSteps)
      const pendingBaseline = textBaseline([], window)
      pendingBaseline.catch(() => {})
      const pendingDefault = inputSteps.length > 0 ? modDefault(mod, window) : null
      pendingDefault?.catch(() => {})
      const request = { target: mod.pluginName, inputSteps, window }
      const [shot, rerun] = await Promise.all([
        recordFullShot(sandboxes, mod.source, request),
        recordFullShot(sandboxes, mod.source, request),
      ])
      const base = await pendingBaseline
      const unswitched = await pendingDefault
      for (const ran of [shot, rerun, ...(unswitched ? [unswitched] : [])]) {
        checkSameVersions(base, ran, 'theme')
      }
      const theme = await sandboxes.withAnalysisSandbox((sandbox) =>
        analyseTheme(sandbox, {
          shots: [shot.png, rerun.png],
          baseline: base.png,
          modDefault: unswitched?.png ?? null,
          window,
        }),
      )
      return { ...theme, ...versionsOf(shot) }
    },
    record: async ({
      mod,
      inputSteps: steps,
      statusLine,
      wholeWindow,
    }): Promise<DesktopRecording> => {
      const inputSteps = desktopSteps(steps)
      checkInputSteps(inputSteps)
      const network = desktopSessionNetwork(statusLine)
      // Started now, alongside the mod's session; awaited only to frame its shot.
      const pendingBaseline = textBaseline(inputSteps)
      pendingBaseline.catch(() => {})
      const shot = await recordFullShot(
        sandboxes,
        mod.source,
        { target: mod.pluginName, inputSteps, statusLine, window: 'dark' },
        network,
      )
      const base = await pendingBaseline
      checkSameVersions(base, shot, 'mod')
      const analysis = await sandboxes.withAnalysisSandbox((sandbox) =>
        wholeWindow
          ? analyseWindow(sandbox, { shot: shot.png, baseline: base.png })
          : analyseShot(sandbox, {
              shot: shot.png,
              baseline: base.png,
              typedSteps: inputSteps.length > 0,
              typedSlashCommand: inputSteps.some((step) => step.text.startsWith('/')),
            }),
      )
      return { ...analysis, ...versionsOf(shot) }
    },
  }
}

export const e2bDesktopRecorder = () => desktopRecorder(E2B_DESKTOP_SANDBOXES)
