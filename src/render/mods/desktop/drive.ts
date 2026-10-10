import { setTimeout as sleep } from 'node:timers/promises'
import type { InputStep } from '@/mods/curation'
import { COMMAND_TIMEOUT_MS, REQUEST_TIMEOUT_MS, SANDBOX_WORK_DIR } from '../mod-sandbox'
import { feedScenario } from '../scenario-feed'
import { setupCommand } from '../session'
import { DESKTOP_SANDBOX_TIMEOUT_MS, type DesktopSandbox } from './desktop-sandbox'
import { type QuietOptions, screenshotCommand } from './imagemagick'
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
  DESKTOP_VERSION_COMMAND,
  deepLinkCommand,
  desktopBootFiles,
  desktopSessionFiles,
  ENGINE_INSTALLED_COMMAND,
  ENGINE_VERSION_COMMAND,
  FIT_WINDOW_COMMAND,
  parseVersion,
  repliedCommand,
} from './session'
import type { DesktopShot } from './types'

export type DesktopVersions = Pick<DesktopShot, 'desktopVersion' | 'engineVersion'>

/** The session's final screen, full size, for the recorder to compare and crop. */
export const FINAL_SHOT = `${SANDBOX_WORK_DIR}/final.png`
const STEP_TEXT = `${SANDBOX_WORK_DIR}/step.txt`

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

/** Uploads (tarball, boot and session files) and commands (unpack, version, setup) at their timeouts. */
const SETUP_MAX_MS = 3 * REQUEST_TIMEOUT_MS + 3 * COMMAND_TIMEOUT_MS
const SESSION_MAX_MS =
  WINDOW_MAX_MS +
  WELCOME.maxMs +
  ENGINE_MAX_MS +
  DEEP_LINK_ATTEMPTS * (DEEP_LINK_MAX_MS + COMMAND_SLACK_MS + TRUST.maxMs) +
  AUTO_MODE.maxMs +
  SEND_MAX_MS +
  REPLY_MAX_MS +
  FINAL_SETTLE.maxMs
const STEP_MAX_MS =
  typingMs('x'.repeat(MAX_STEP_CHARS)) + TYPED_PAUSE_MS + SEND_MAX_MS + STEP_SETTLE.maxMs
/** The input steps whose waits still end before the Desktop sandbox does. */
export const MAX_INPUT_STEPS = Math.floor(
  (DESKTOP_SANDBOX_TIMEOUT_MS - SETUP_MAX_MS - SESSION_MAX_MS) / STEP_MAX_MS,
)

async function bootDesktop(sandbox: DesktopSandbox): Promise<void> {
  const scenario = feedScenario()
  await sandbox.writeFiles(desktopBootFiles(scenario))
  expectOk(await sandbox.run(setupCommand(scenario)), 'session setup')
  await sandbox.start(bootCommand(scenario, sandbox.pluginDir))
  await waitFor(
    sandbox,
    'the Desktop window to fill the display',
    FIT_WINDOW_COMMAND,
    WINDOW_MAX_MS,
  )
  if (!(await pressButton(sandbox, WELCOME_CONTINUE, WELCOME))) {
    throw new Error('the gateway welcome screen never went away')
  }
  await waitFor(sandbox, "Desktop's engine install", ENGINE_INSTALLED_COMMAND, ENGINE_MAX_MS)
}

async function openSession(sandbox: DesktopSandbox): Promise<void> {
  for (let attempt = 0; attempt < DEEP_LINK_ATTEMPTS; attempt++) {
    await sandbox.run(deepLinkCommand(feedScenario()), DEEP_LINK_MAX_MS + COMMAND_SLACK_MS)
    if (await pressButton(sandbox, TRUST_WORKSPACE, TRUST)) {
      // Shown once on a fresh install, if this Desktop build has it: pressed when it is there.
      await pressButton(sandbox, AUTO_MODE_GOT_IT, AUTO_MODE)
      return
    }
  }
  throw new Error('the session never asked to trust the workspace')
}

async function typeStep(sandbox: DesktopSandbox, step: InputStep): Promise<void> {
  expectOk(await sandbox.run(clickCommand(PROMPT_FOCUS)), 'focusing the prompt')
  await sandbox.writeFiles([{ path: STEP_TEXT, data: step.text }])
  expectOk(
    await sandbox.run(typeFileCommand(STEP_TEXT), typingMs(step.text) + COMMAND_SLACK_MS),
    'typing a step',
  )
  await sleep(TYPED_PAUSE_MS)
  if (step.submit !== false) await sendPrompt(sandbox)
  await settle(sandbox, STEP_SETTLE)
}

export interface DriveRequest {
  /** The mod's plugin.json name, which the scenario feed answers; null for the baseline. */
  target: string | null
  inputSteps: readonly InputStep[]
}

/**
 * Boots Desktop, sends the scripted prompt, types the input steps, waits for the screen to settle
 * and leaves the final shot at FINAL_SHOT. Every wait is bounded.
 */
export async function driveSession(
  sandbox: DesktopSandbox,
  { target, inputSteps }: DriveRequest,
): Promise<DesktopVersions> {
  const scenario = feedScenario()
  const desktopVersion = parseVersion(
    expectOk(await sandbox.run(DESKTOP_VERSION_COMMAND), 'reading the Desktop version').stdout,
    'Desktop',
  )
  await bootDesktop(sandbox)
  const engineVersion = parseVersion(
    expectOk(await sandbox.run(ENGINE_VERSION_COMMAND), 'reading the engine version').stdout,
    'engine',
  )
  const seed = { target, nowMs: Date.now(), claudeCodeVersion: engineVersion }
  await sandbox.writeFiles(desktopSessionFiles(scenario, seed))
  expectOk(await sandbox.run(keyCommand('ctrl+b')), 'collapsing the sidebar')
  await openSession(sandbox)
  expectOk(await sandbox.run(clickCommand(PROMPT_FOCUS)), 'focusing the prompt')
  expectOk(await sandbox.run(keyCommand('End')), 'moving to the end of the prompt')
  await sendPrompt(sandbox)
  await waitFor(sandbox, 'the scripted reply', repliedCommand(scenario), REPLY_MAX_MS)
  for (const step of inputSteps) await typeStep(sandbox, step)
  expectOk(await sandbox.run(clickCommand(BLUR)), 'clicking off the prompt')
  expectOk(await sandbox.run(moveCommand(MOUSE_REST)), 'resting the mouse')
  await settle(sandbox, FINAL_SETTLE)
  expectOk(await sandbox.run(screenshotCommand(FINAL_SHOT)), 'the final screenshot')
  return { desktopVersion, engineVersion }
}
