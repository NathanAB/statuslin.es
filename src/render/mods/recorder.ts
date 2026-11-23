import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import type { InputStep } from '@/mods/curation'
import { SANDBOX_CLAUDE_CODE_BIN } from '../e2b-template'
import type { Scenario } from '../types'
import { boundRecording } from './bound-recording'
import {
  COMMAND_TIMEOUT_MS,
  type ModSource,
  REQUEST_TIMEOUT_MS,
  type RecordingSandbox,
  SANDBOX_TIMEOUT_MS,
  withRecordingSandbox,
  withReplaySandbox,
} from './mod-sandbox'
import { sceneSession, sceneTerminal } from './record-scene'
import { replayInSandbox } from './replay'
import { feedScenario, feedStdin } from './scenario-feed'
import { keystrokes, launchCommand, sessionEnv, setupCommand } from './session'
import type { TerminalSetup } from './terminal'

export interface ModUnderRender {
  source: ModSource
  /** Its plugin.json name: the scenario feed answers only this plugin. */
  pluginName: string
}

/** A mod's session: the scripted prompt, then the mod's input steps, in the mod's terminal. */
export interface ModSceneRequest {
  scene: 'mod'
  /** null records the baseline: the same session with no mod. */
  mod: ModUnderRender | null
  inputSteps: readonly InputStep[]
  terminal: TerminalSetup
}

/**
 * The theme scene (`theme-scene.ts`), which fixes the typed prompt and the terminal, so every
 * theme's card shows the same session.
 */
export interface ThemeSceneRequest {
  scene: 'theme'
  /** The plugin that carries the theme; null records the scene with no plugin. */
  mod: ModUnderRender | null
  /** The `theme` setting the session runs in; null leaves Claude Code's dark default. */
  theme: string | null
}

export type RecordRequest = ModSceneRequest | ThemeSceneRequest

export interface Recording {
  /** The final screen, one SGR-styled string per row, as `cropModPreview` takes it. Untrusted. */
  rows: string[]
  claudeCodeVersion: string
}

export interface ModRecorder {
  record(request: RecordRequest): Promise<Recording>
}

/** How long the session waits on the pty. Tests shorten it; real recordings use the defaults. */
export interface SessionTiming {
  /** Claude Code has settled once its output has been silent this long. */
  quietMs: number
  keyPauseMs: number
  pollMs: number
}

const SESSION_TIMING: SessionTiming = { quietMs: 2_000, keyPauseMs: 200, pollMs: 100 }
const SHELL_MAX_MS = 5_000
/** A mod that never goes quiet is recorded as it stands when the wait runs out. */
const LAUNCH_MAX_MS = 60_000
const STEP_MAX_MS = 45_000
const PROMPT_GLYPH = '❯'
/**
 * The worst case inside the recording sandbox before the session starts: the tarball upload, the
 * session-file upload and the pty start at their request timeout, and unpacking, `claude --version`
 * and setup at their command timeout. Measured runs take about 10 s.
 */
const SETUP_MAX_MS = 3 * REQUEST_TIMEOUT_MS + 3 * COMMAND_TIMEOUT_MS
/**
 * A step's waits: its settle plus the pause before Enter. The pty input requests it sends, like the
 * launch's and the closing kill, are not counted; each returns in milliseconds, and one that stalls
 * to its request timeout runs into the sandbox lifetime, which fails the recording.
 */
const STEP_BUDGET_MS = STEP_MAX_MS + SESSION_TIMING.keyPauseMs
/**
 * The input steps whose waits, after the scripted prompt's, still end before the recording sandbox
 * does. The replay runs after that sandbox is killed, in a sandbox with its own lifetime.
 */
export const MAX_INPUT_STEPS =
  Math.floor((SANDBOX_TIMEOUT_MS - SETUP_MAX_MS - SHELL_MAX_MS - LAUNCH_MAX_MS) / STEP_BUDGET_MS) -
  1
/** A whole session's pty output; a mod flooding the tty fails the recording here. */
export const PTY_MAX_BYTES = 4 * 1024 * 1024

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)

async function claudeCodeVersion(sandbox: RecordingSandbox, scenario: Scenario): Promise<string> {
  const { exitCode, stdout, stderr } = await sandbox.run(
    `${SANDBOX_CLAUDE_CODE_BIN} --version`,
    sessionEnv(scenario),
  )
  if (exitCode !== 0) throw new Error(`claude --version failed: ${stderr.trim()}`)
  return versionSchema.parse(stdout.trim().split(' ')[0])
}

export class PtyOutput {
  readonly chunks: Uint8Array[] = []
  overflowed = false
  private byteCount = 0

  /** False when `bytes` was dropped because the output has passed the cap. */
  push(bytes: Uint8Array): boolean {
    if (this.overflowed) return false
    this.byteCount += bytes.byteLength
    this.overflowed = this.byteCount > PTY_MAX_BYTES
    if (this.overflowed) return false
    this.chunks.push(bytes)
    return true
  }
}

async function recordSession(
  sandbox: RecordingSandbox,
  scenario: Scenario,
  modPluginDir: string | null,
  typed: readonly InputStep[],
  { cols, rows }: { cols: number; rows: number },
  timing: SessionTiming,
): Promise<Uint8Array> {
  const output = new PtyOutput()
  let lastActivityAt = performance.now()
  let launchChunk: number | undefined
  let promptShown = false
  const decoder = new TextDecoder()
  const terminal = await sandbox.openTerminal({
    cols,
    rows,
    cwd: feedStdin(scenario).workspace.current_dir,
    envs: sessionEnv(scenario),
    onData: (bytes) => {
      if (!output.push(bytes)) return
      lastActivityAt = performance.now()
      if (launchChunk !== undefined && !promptShown) {
        promptShown = decoder.decode(bytes, { stream: true }).includes(PROMPT_GLYPH)
      }
    },
  })
  const send = async (input: string) => {
    await terminal.send(input)
    lastActivityAt = performance.now()
  }
  const settle = async (maxMs: number, ready = () => true) => {
    const startedAt = performance.now()
    const settled = () => ready() && performance.now() - lastActivityAt >= timing.quietMs
    while (!output.overflowed && !settled() && performance.now() - startedAt < maxMs)
      await sleep(timing.pollMs)
    if (output.overflowed) throw new Error(`pty output passed ${PTY_MAX_BYTES} bytes`)
  }
  try {
    await settle(SHELL_MAX_MS)
    launchChunk = output.chunks.length
    await send(`clear; ${launchCommand(scenario, modPluginDir)}\r`)
    // Quiet alone is not enough: Claude Code can be silent for 2 s while it starts, and a prompt
    // typed then stayed unsubmitted in a measured run.
    await settle(LAUNCH_MAX_MS, () => promptShown)
    for (const step of typed) {
      for (const [i, chunk] of keystrokes(step).entries()) {
        if (i > 0) await sleep(timing.keyPauseMs)
        await send(chunk)
      }
      await settle(STEP_MAX_MS)
    }
    return Buffer.concat(output.chunks.slice(launchChunk))
  } finally {
    await terminal.kill()
  }
}

/** A session's raw pty bytes, from the launch on. Hostile: parse them only in a fresh sandbox. */
export interface SessionCapture {
  pty: Uint8Array
  claudeCodeVersion: string
}

export async function recordInSandbox(
  sandbox: RecordingSandbox,
  request: RecordRequest,
  timing: SessionTiming = SESSION_TIMING,
): Promise<SessionCapture> {
  const scenario = feedScenario()
  const version = await claudeCodeVersion(sandbox, scenario)
  const { files, typed } = sceneSession(request, scenario, version)
  await sandbox.writeFiles(files)
  const setup = await sandbox.run(setupCommand(scenario))
  if (setup.exitCode !== 0) throw new Error(`session setup failed: ${setup.stderr.trim()}`)
  const modPluginDir = request.mod ? sandbox.pluginDir : null
  const size = sceneTerminal(request)
  const pty = await recordSession(sandbox, scenario, modPluginDir, typed, size, timing)
  return { pty, claudeCodeVersion: version }
}

interface Sandboxes {
  withRecordingSandbox: typeof withRecordingSandbox
  withReplaySandbox: typeof withReplaySandbox
}

/**
 * Mod code runs in a recording sandbox, which is killed before its pty bytes are parsed. They are
 * parsed in a second, fresh sandbox, so a stream that exhausts xterm takes down only that sandbox.
 */
export function modRecorder(
  sandboxes: Sandboxes,
  timing: SessionTiming = SESSION_TIMING,
): ModRecorder {
  return {
    record: async (request) => {
      const steps = request.scene === 'mod' ? request.inputSteps.length : 0
      if (steps > MAX_INPUT_STEPS) {
        throw new Error(
          `${steps} input steps cannot finish inside the sandbox lifetime; at most ${MAX_INPUT_STEPS} can`,
        )
      }
      const { pty, claudeCodeVersion } = await sandboxes.withRecordingSandbox(
        request.mod?.source ?? null,
        (sandbox) => recordInSandbox(sandbox, request, timing),
      )
      const { cols, rows: height } = sceneTerminal(request)
      const rows = await sandboxes.withReplaySandbox((sandbox) =>
        replayInSandbox(sandbox, pty, cols, height),
      )
      return boundRecording({ rows, claudeCodeVersion })
    },
  }
}

export const e2bModRecorder = modRecorder({ withRecordingSandbox, withReplaySandbox })
