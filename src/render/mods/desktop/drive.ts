import { setTimeout as sleep } from 'node:timers/promises'
import type { InputStep } from '@/mods/curation'
import { COMMAND_TIMEOUT_MS, REQUEST_TIMEOUT_MS, type SandboxFile } from '../mod-sandbox'
import { feedScenario } from '../scenario-feed'
import { setupCommand } from '../session'
import {
  DESKTOP_SANDBOX_TIMEOUT_MS,
  type DesktopVersions,
  type RecordingDesktop,
} from './desktop-sandbox'
import type { QuietOptions } from './imagemagick'
import { clickCommand, keyCommand, moveCommand, typeFileCommand, typingMs } from './input'
import {
  type ButtonWait,
  COMMAND_SLACK_MS,
  expectOk,
  pressButton,
  SEND_MAX_MS,
  sendPrompt,
  settle,
  waitFor,
} from './interact'
import {
  AUTO_MODE_GOT_IT,
  BLUR,
  MOUSE_REST,
  PROMPT_FOCUS,
  TRUST_WORKSPACE,
  WELCOME_CONTINUE,
} from './screen'
import {
  bootCommand,
  deepLinkCommand,
  desktopSessionFiles,
  ENGINE_INSTALLED_COMMAND,
  FIT_WINDOW_COMMAND,
  repliedCommand,
  stepFiles,
  stepTextPath,
} from './session'

const WINDOW_MAX_MS = 30_000
/** Desktop's welcome paints, reloads, then paints again; a click during the first paint is lost. */
const WELCOME: ButtonWait = { stableMs: 1500, goneMs: 3000, maxMs: 45_000 }
const ENGINE_MAX_MS = 30_000
/** A deep link sent before Desktop is ready is dropped, so it is sent again. */
const DEEP_LINK_ATTEMPTS = 3
const DEEP_LINK_MAX_MS = 15_000
const TRUST: ButtonWait = { stableMs: 500, goneMs: 1000, maxMs: 8_000 }
const AUTO_MODE: ButtonWait = { stableMs: 300, goneMs: 500, maxMs: 4_000 }
const REPLY_MAX_MS = 30_000
const TYPED_PAUSE_MS = 800
const STEP_SETTLE: QuietOptions = { quietMs: 2_000, maxMs: 15_000, pollMs: 500 }
const FINAL_SETTLE: QuietOptions = { quietMs: 2_000, maxMs: 10_000, pollMs: 500 }

/** Typed a character at a time, so a step's text is bounded to keep its typing bounded. */
export const MAX_STEP_CHARS = 200

/** Uploads (tarball, session files) and commands (two versions, unpack, setup) at their timeouts. */
const SETUP_MAX_MS = 2 * REQUEST_TIMEOUT_MS + 4 * COMMAND_TIMEOUT_MS
const SESSION_MAX_MS =
  WINDOW_MAX_MS +
  WELCOME.maxMs +
  ENGINE_MAX_MS +
  DEEP_LINK_ATTEMPTS * (DEEP_LINK_MAX_MS + COMMAND_SLACK_MS + TRUST.maxMs) +
  AUTO_MODE.maxMs +
  SEND_MAX_MS +
  REPLY_MAX_MS +
  FINAL_SETTLE.maxMs +
  // Printing the final shot.
  COMMAND_TIMEOUT_MS
const STEP_MAX_MS =
  typingMs('x'.repeat(MAX_STEP_CHARS)) + TYPED_PAUSE_MS + SEND_MAX_MS + STEP_SETTLE.maxMs
/** The input steps whose waits still end before the recording sandbox does. */
export const MAX_INPUT_STEPS = Math.floor(
  (DESKTOP_SANDBOX_TIMEOUT_MS - SETUP_MAX_MS - SESSION_MAX_MS) / STEP_MAX_MS,
)

export interface DriveRequest {
  /** The mod's plugin.json name, which the scenario feed answers; null for the baseline. */
  target: string | null
  inputSteps: readonly InputStep[]
}

/** Every file a session needs, staged before Desktop starts: the session's, and the steps' text. */
export function sessionUploads(
  { target, inputSteps }: DriveRequest,
  { engineVersion }: DesktopVersions,
): SandboxFile[] {
  const seed = { target, nowMs: Date.now(), claudeCodeVersion: engineVersion }
  return [...desktopSessionFiles(feedScenario(), seed), ...stepFiles(inputSteps)]
}

async function bootDesktop(desktop: RecordingDesktop): Promise<void> {
  const scenario = feedScenario()
  expectOk(await desktop.run(setupCommand(scenario)), 'session setup')
  await desktop.start(bootCommand(scenario, desktop.pluginDir))
  await waitFor(
    desktop,
    'the Desktop window to fill the display',
    FIT_WINDOW_COMMAND,
    WINDOW_MAX_MS,
  )
  if (!(await pressButton(desktop, WELCOME_CONTINUE, WELCOME))) {
    throw new Error('the gateway welcome screen never went away')
  }
  await waitFor(desktop, "Desktop's engine install", ENGINE_INSTALLED_COMMAND, ENGINE_MAX_MS)
}

async function openSession(desktop: RecordingDesktop): Promise<void> {
  for (let attempt = 0; attempt < DEEP_LINK_ATTEMPTS; attempt++) {
    await desktop.run(deepLinkCommand(feedScenario()), DEEP_LINK_MAX_MS + COMMAND_SLACK_MS)
    if (await pressButton(desktop, TRUST_WORKSPACE, TRUST)) {
      // Shown once on a fresh install, if this Desktop build has it: pressed when it is there.
      await pressButton(desktop, AUTO_MODE_GOT_IT, AUTO_MODE)
      return
    }
  }
  throw new Error('the session never asked to trust the workspace')
}

async function typeStep(desktop: RecordingDesktop, step: InputStep, index: number): Promise<void> {
  expectOk(await desktop.run(clickCommand(PROMPT_FOCUS)), 'focusing the prompt')
  expectOk(
    await desktop.run(typeFileCommand(stepTextPath(index)), typingMs(step.text) + COMMAND_SLACK_MS),
    'typing a step',
  )
  await sleep(TYPED_PAUSE_MS)
  if (step.submit !== false) await sendPrompt(desktop)
  await settle(desktop, STEP_SETTLE)
}

/**
 * Boots Desktop, sends the scripted prompt, types the staged input steps and waits for the screen
 * to settle, ready for its final shot. Every wait is bounded; nothing is uploaded.
 */
export async function driveSession(
  desktop: RecordingDesktop,
  inputSteps: readonly InputStep[],
): Promise<void> {
  await bootDesktop(desktop)
  expectOk(await desktop.run(keyCommand('ctrl+b')), 'collapsing the sidebar')
  await openSession(desktop)
  expectOk(await desktop.run(clickCommand(PROMPT_FOCUS)), 'focusing the prompt')
  expectOk(await desktop.run(keyCommand('End')), 'moving to the end of the prompt')
  await sendPrompt(desktop)
  await waitFor(desktop, 'the scripted reply', repliedCommand(feedScenario()), REPLY_MAX_MS)
  for (const [i, step] of inputSteps.entries()) await typeStep(desktop, step, i)
  expectOk(await desktop.run(clickCommand(BLUR)), 'clicking off the prompt')
  expectOk(await desktop.run(moveCommand(MOUSE_REST)), 'resting the mouse')
  await settle(desktop, FINAL_SETTLE)
}
