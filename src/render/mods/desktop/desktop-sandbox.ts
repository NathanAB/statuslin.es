import type { Sandbox } from 'e2b'
import { E2B_DESKTOP_TEMPLATE_ID } from '../../e2b-template'
import {
  COMMAND_TIMEOUT_MS,
  type CommandOutput,
  type ModSource,
  REQUEST_TIMEOUT_MS,
  runBounded,
  SANDBOX_MOD_PLUGIN_DIR,
  type SandboxFile,
  unpack,
  withTemplateSandbox,
  writeFiles,
} from '../mod-sandbox'
import { parsePrintedPng, printedPngCommand } from './imagemagick'
import { PNG_MAX_BYTES } from './png'
import { DESKTOP_VERSION_COMMAND, DISPLAY, ENGINE_VERSION_COMMAND, parseVersion } from './session'
import type { DesktopShot } from './types'

export type DesktopVersions = Pick<DesktopShot, 'desktopVersion' | 'engineVersion'>

/** Nothing the recorder runs prints much; a flood is the mod's doing and fails the recording. */
const COMMAND_MAX_OUTPUT_BYTES = 64 * 1024
/** A PNG at the cap, base64-encoded, plus a newline's slack. */
const PRINTED_PNG_MAX_BYTES = Math.ceil(PNG_MAX_BYTES / 3) * 4 + 16
/**
 * Recording sandbox lifetime ceiling: the worst case of every bounded wait in a session
 * (drive.ts). The `finally` kill is the real teardown; a measured recording takes under a minute.
 */
export const DESKTOP_SANDBOX_TIMEOUT_MS = 15 * 60_000
/** The analysis sandbox's one upload, and its probe, comparison and crop commands. */
const ANALYSIS_SANDBOX_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 4 * COMMAND_TIMEOUT_MS

/**
 * A Desktop sandbox the mod's code may be running in. It has no upload: E2B's file API writes as
 * root and follows links, so once a mod can act, only commands run as the user reach it, and
 * everything they print is untrusted (a mod can even redefine commands in its login shell).
 */
export interface RecordingDesktop {
  /** The mod's plugin folder, or null for the baseline. */
  readonly pluginDir: string | null
  /** Runs on the virtual display, bounded in time and output. A non-zero exit is returned. */
  run(command: string, timeoutMs?: number): Promise<CommandOutput>
  /** Starts a command that keeps running until the sandbox is killed. */
  start(command: string): Promise<void>
  /** The bytes of the PNG `command` prints to stdout, bounded. Untrusted. */
  readPng(command: string): Promise<Uint8Array>
}

export interface RecordingSetup {
  source: ModSource | null
  /** Every file the session needs, uploaded before Desktop, and so any mod code, can start. */
  files: (versions: DesktopVersions) => SandboxFile[]
}

/** A fresh sandbox no mod code has run in, where a recording's shots are compared and cropped. */
export interface AnalysisSandbox {
  writeFiles(files: SandboxFile[]): Promise<void>
  run(command: string, timeoutMs?: number): Promise<CommandOutput>
  readPng(command: string): Promise<Uint8Array>
}

const runOnDisplay = (sandbox: Sandbox, command: string, timeoutMs = COMMAND_TIMEOUT_MS) =>
  runBounded(sandbox, `export DISPLAY=${DISPLAY}; ${command}`, {
    timeoutMs,
    maxOutputBytes: COMMAND_MAX_OUTPUT_BYTES,
  })

async function readPng(sandbox: Sandbox, command: string): Promise<Uint8Array> {
  const { exitCode, stdout } = await runBounded(
    sandbox,
    `export DISPLAY=${DISPLAY}; ${printedPngCommand(command)}`,
    { timeoutMs: COMMAND_TIMEOUT_MS, maxOutputBytes: PRINTED_PNG_MAX_BYTES },
  )
  if (exitCode !== 0) throw new Error(`printing a PNG failed (exit ${exitCode})`)
  return parsePrintedPng(stdout)
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

/** Read from the template before anything of the mod's is in the sandbox. */
async function readVersions(sandbox: Sandbox): Promise<DesktopVersions> {
  const read = async (command: string, what: string) => {
    const { exitCode, stdout } = await runOnDisplay(sandbox, command)
    if (exitCode !== 0) throw new Error(`reading the ${what} version failed (exit ${exitCode})`)
    return parseVersion(stdout, what)
  }
  return {
    desktopVersion: await read(DESKTOP_VERSION_COMMAND, 'Desktop'),
    engineVersion: await read(ENGINE_VERSION_COMMAND, 'engine'),
  }
}

/**
 * Cold boots a Desktop sandbox for one session: reads the versions, unpacks the mod (the tarball
 * never touches the host's filesystem) and uploads every file, then hands over a sandbox with no
 * upload left in it.
 */
export function withRecordingDesktop<T>(
  { source, files }: RecordingSetup,
  use: (desktop: RecordingDesktop, versions: DesktopVersions) => Promise<T>,
): Promise<T> {
  return withTemplateSandbox(
    E2B_DESKTOP_TEMPLATE_ID,
    DESKTOP_SANDBOX_TIMEOUT_MS,
    async (sandbox) => {
      const versions = await readVersions(sandbox)
      if (source) await unpack(sandbox, source)
      await writeFiles(sandbox, files(versions))
      const desktop: RecordingDesktop = {
        pluginDir: source ? SANDBOX_MOD_PLUGIN_DIR : null,
        run: (command, timeoutMs) => runOnDisplay(sandbox, command, timeoutMs),
        start: (command) => start(sandbox, command),
        readPng: (command) => readPng(sandbox, command),
      }
      return use(desktop, versions)
    },
  )
}

/** Mirrors the terminal recorder's replay sandbox: hostile shots are only ever parsed here. */
export function withAnalysisSandbox<T>(use: (analysis: AnalysisSandbox) => Promise<T>): Promise<T> {
  return withTemplateSandbox(E2B_DESKTOP_TEMPLATE_ID, ANALYSIS_SANDBOX_TIMEOUT_MS, (sandbox) =>
    use({
      writeFiles: (files) => writeFiles(sandbox, files),
      run: (command, timeoutMs) => runOnDisplay(sandbox, command, timeoutMs),
      readPng: (command) => readPng(sandbox, command),
    }),
  )
}

export const E2B_DESKTOP_SANDBOXES = { withRecordingDesktop, withAnalysisSandbox }
