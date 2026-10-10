import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { SANDBOX_REPLAY_DIR } from '../e2b-template'
import { RECORDING_MAX_BYTES, RECORDING_MAX_ROWS } from './bound-recording'
import { REPLAY_TIMEOUT_MS, type ReplaySandbox, SANDBOX_WORK_DIR } from './mod-sandbox'
import { TERMINAL } from './session'

export const REPLAY_SCRIPT_SRC = join(import.meta.dirname, 'sandbox/replay.cjs')
const SCRIPT_FILE = `${SANDBOX_WORK_DIR}/replay.cjs`
const RECORDING_FILE = `${SANDBOX_WORK_DIR}/recording.bin`
const XTERM_DIR = `${SANDBOX_REPLAY_DIR}/node_modules/@xterm/headless`
const COMMAND = `node ${SCRIPT_FILE} ${XTERM_DIR} ${RECORDING_FILE} ${TERMINAL.cols} ${TERMINAL.rows}`

/**
 * The JSON of a screen inside the recording caps: JSON escapes a byte into at most six (`\u001b`),
 * each row adds its quotes and comma, and the array its brackets.
 */
export const REPLAY_OUTPUT_MAX_BYTES = 6 * RECORDING_MAX_BYTES + 3 * RECORDING_MAX_ROWS + 2
const ERROR_MAX_CHARS = 200

const screenSchema = z.array(z.string())

/** A `ReplaySandbox` does not promise its output cap, so the size is checked before parsing. */
export function parseScreen(stdout: string): string[] {
  if (Buffer.byteLength(stdout) > REPLAY_OUTPUT_MAX_BYTES) {
    throw new Error(`replay output is over the ${REPLAY_OUTPUT_MAX_BYTES}-byte limit`)
  }
  return screenSchema.parse(JSON.parse(stdout))
}

export async function replayInSandbox(sandbox: ReplaySandbox, pty: Uint8Array): Promise<string[]> {
  await sandbox.writeFiles([
    { path: RECORDING_FILE, data: pty },
    { path: SCRIPT_FILE, data: readFileSync(REPLAY_SCRIPT_SRC, 'utf8') },
  ])
  const { exitCode, stdout, stderr } = await sandbox.runBounded(COMMAND, {
    timeoutMs: REPLAY_TIMEOUT_MS,
    maxOutputBytes: REPLAY_OUTPUT_MAX_BYTES,
  })
  if (exitCode !== 0) {
    throw new Error(`replay exited ${exitCode}: ${stderr.trim().slice(0, ERROR_MAX_CHARS)}`)
  }
  return parseScreen(stdout)
}
