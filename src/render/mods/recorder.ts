import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import type { InputStep } from '@/mods/curation'
import { SANDBOX_CLAUDE_CODE_BIN } from '../e2b-template'
import type { Scenario } from '../types'
import { type ModSource, type RecordingSandbox, withRecordingSandbox } from './mod-sandbox'
import { feedScenario, feedStdin } from './scenario-feed'
import {
  keystrokes,
  launchCommand,
  REPLAY,
  replayFiles,
  SCRIPTED_PROMPT,
  sessionEnv,
  sessionFiles,
  setupCommand,
  TERMINAL,
} from './session'

export interface ModUnderRender {
  source: ModSource
  /** Its plugin.json name: the scenario feed answers only this plugin. */
  pluginName: string
}

export interface RecordRequest {
  /** null records the baseline: the same session with no mod. */
  mod: ModUnderRender | null
  inputSteps: readonly InputStep[]
}

export interface Recording {
  /** The final screen, one SGR-styled string per row, as `cropModPreview` takes it. Untrusted. */
  rows: string[]
  claudeCodeVersion: string
}

export interface ModRecorder {
  record(request: RecordRequest): Promise<Recording>
}

/** Claude Code has settled once its output has been silent this long. */
const QUIET_MS = 2_000
const SHELL_MAX_MS = 5_000
/** A mod that never goes quiet is recorded as it stands when the wait runs out. */
const LAUNCH_MAX_MS = 60_000
const STEP_MAX_MS = 45_000
const KEY_PAUSE_MS = 200
const POLL_MS = 100
const PROMPT_GLYPH = '❯'

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
const screenSchema = z.array(z.string()).length(TERMINAL.rows)

async function claudeCodeVersion(sandbox: RecordingSandbox, scenario: Scenario): Promise<string> {
  const { exitCode, stdout, stderr } = await sandbox.run(
    `${SANDBOX_CLAUDE_CODE_BIN} --version`,
    sessionEnv(scenario),
  )
  if (exitCode !== 0) throw new Error(`claude --version failed: ${stderr.trim()}`)
  return versionSchema.parse(stdout.trim().split(' ')[0])
}

async function recordSession(
  sandbox: RecordingSandbox,
  scenario: Scenario,
  modPluginDir: string | null,
  inputSteps: readonly InputStep[],
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let lastActivityAt = performance.now()
  let launchChunk: number | undefined
  let promptShown = false
  const decoder = new TextDecoder()
  const terminal = await sandbox.openTerminal({
    ...TERMINAL,
    cwd: feedStdin(scenario).workspace.current_dir,
    envs: sessionEnv(scenario),
    onData: (bytes) => {
      chunks.push(bytes)
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
    const settled = () => ready() && performance.now() - lastActivityAt >= QUIET_MS
    while (!settled() && performance.now() - startedAt < maxMs) await sleep(POLL_MS)
  }
  try {
    await settle(SHELL_MAX_MS)
    launchChunk = chunks.length
    await send(`clear; ${launchCommand(scenario, modPluginDir)}\r`)
    // Quiet alone is not enough: Claude Code can be silent for 2 s while it starts, and a prompt
    // typed then stayed unsubmitted in a measured run.
    await settle(LAUNCH_MAX_MS, () => promptShown)
    for (const step of [SCRIPTED_PROMPT, ...inputSteps]) {
      for (const [i, chunk] of keystrokes(step).entries()) {
        if (i > 0) await sleep(KEY_PAUSE_MS)
        await send(chunk)
      }
      await settle(STEP_MAX_MS)
    }
    return Buffer.concat(chunks.slice(launchChunk))
  } finally {
    await terminal.kill()
  }
}

async function replay(sandbox: RecordingSandbox, recording: Uint8Array): Promise<string[]> {
  await sandbox.writeFiles(replayFiles(recording))
  const { exitCode, stdout, stderr } = await sandbox.run(REPLAY.command, REPLAY.envs)
  if (exitCode !== 0) throw new Error(`replay failed: ${stderr.trim()}`)
  return screenSchema.parse(JSON.parse(stdout))
}

/** One fresh sandbox per recording, with the network off. Mod code runs only in there. */
export const e2bModRecorder: ModRecorder = {
  record: ({ mod, inputSteps }) =>
    withRecordingSandbox(mod?.source ?? null, async (sandbox) => {
      const scenario = feedScenario()
      const version = await claudeCodeVersion(sandbox, scenario)
      const seed = {
        target: mod?.pluginName ?? null,
        nowMs: Date.now(),
        claudeCodeVersion: version,
      }
      await sandbox.writeFiles(sessionFiles(scenario, seed))
      const setup = await sandbox.run(setupCommand(scenario))
      if (setup.exitCode !== 0) throw new Error(`session setup failed: ${setup.stderr.trim()}`)
      const recording = await recordSession(
        sandbox,
        scenario,
        mod ? sandbox.pluginDir : null,
        inputSteps,
      )
      return { rows: await replay(sandbox, recording), claudeCodeVersion: version }
    }),
}
