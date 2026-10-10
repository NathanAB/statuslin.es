import type { Sandbox } from 'e2b'
import { E2B_DESKTOP_TEMPLATE_ID } from '../../e2b-template'
import {
  COMMAND_TIMEOUT_MS,
  type CommandOutput,
  type ModSource,
  runBounded,
  SANDBOX_MOD_PLUGIN_DIR,
  type SandboxFile,
  unpack,
  withTemplateSandbox,
  writeFiles,
} from '../mod-sandbox'
import { DISPLAY } from './session'

/** Nothing the recorder runs prints much; a flood is the mod's doing and fails the recording. */
const COMMAND_MAX_OUTPUT_BYTES = 64 * 1024
/**
 * Sandbox lifetime ceiling: the worst case of every bounded wait in a session (drive.ts). The
 * `finally` kill is the real teardown; a measured recording takes under a minute.
 */
export const DESKTOP_SANDBOX_TIMEOUT_MS = 15 * 60_000

/** A sandbox with Claude Desktop on a virtual display. Everything runs as the unprivileged user. */
export interface DesktopSandbox {
  /** The mod's plugin folder, or null for the baseline. */
  readonly pluginDir: string | null
  /** Runs on the virtual display, bounded in time and output. A non-zero exit is returned. */
  run(command: string, timeoutMs?: number): Promise<CommandOutput>
  /** Starts a command that keeps running until the sandbox is killed. */
  start(command: string): Promise<void>
  writeFiles(files: SandboxFile[]): Promise<void>
  /** Reads a file the sandbox wrote, refusing it past `maxBytes` without holding more. */
  readFile(path: string, maxBytes: number): Promise<Uint8Array>
}

async function readCapped(sandbox: Sandbox, path: string, maxBytes: number): Promise<Uint8Array> {
  const stream = await sandbox.files.read(path, { format: 'stream', user: 'user' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error(`${path} is over the ${maxBytes}-byte cap`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

async function start(sandbox: Sandbox, command: string): Promise<void> {
  const handle = await sandbox.commands.run(command, {
    background: true,
    user: 'user',
    timeoutMs: DESKTOP_SANDBOX_TIMEOUT_MS,
  })
  // Its output is left in the sandbox: nothing it prints is buffered here.
  await handle.disconnect()
}

/** Cold boots a Desktop sandbox per call; the mod's tarball never touches the host's filesystem. */
export function withDesktopSandbox<T>(
  source: ModSource | null,
  use: (sandbox: DesktopSandbox) => Promise<T>,
): Promise<T> {
  return withTemplateSandbox(
    E2B_DESKTOP_TEMPLATE_ID,
    DESKTOP_SANDBOX_TIMEOUT_MS,
    async (sandbox) => {
      if (source) await unpack(sandbox, source)
      return use({
        pluginDir: source ? SANDBOX_MOD_PLUGIN_DIR : null,
        run: (command, timeoutMs = COMMAND_TIMEOUT_MS) =>
          runBounded(sandbox, `export DISPLAY=${DISPLAY}; ${command}`, {
            timeoutMs,
            maxOutputBytes: COMMAND_MAX_OUTPUT_BYTES,
          }),
        start: (command) => start(sandbox, command),
        writeFiles: (files) => writeFiles(sandbox, files),
        readFile: (path, maxBytes) => readCapped(sandbox, path, maxBytes),
      })
    },
  )
}
