import { CommandExitError, type CommandHandle, Sandbox, TimeoutError } from 'e2b'
import { requireEnv } from '@/lib/env'
import { buildNetworkOption } from '../e2b-network'
import { E2B_MOD_TEMPLATE_ID } from '../e2b-template'

const SANDBOX_USER = 'user'
/** Harness files the recorder and importer write as `user`. */
export const SANDBOX_WORK_DIR = '/home/user/.statuslines'
export const SANDBOX_PLUGINS_DIR = '/home/user/plugins'
const TARBALL_PATH = `${SANDBOX_WORK_DIR}/mod.tar.gz`
const PLUGIN_DIR = `${SANDBOX_PLUGINS_DIR}/mod`
/** Sandbox lifetime ceiling. The `finally` kill is the real teardown; this is a backstop. */
export const SANDBOX_TIMEOUT_MS = 10 * 60_000
export const REQUEST_TIMEOUT_MS = 60_000
export const COMMAND_TIMEOUT_MS = 60_000
export const REPLAY_TIMEOUT_MS = 20_000
/** The recording's upload and the replay command's start are each one request. */
const REPLAY_SANDBOX_TIMEOUT_MS = 2 * REQUEST_TIMEOUT_MS + REPLAY_TIMEOUT_MS

export interface CommandOutput {
  exitCode: number
  stdout: string
  stderr: string
}

export interface ModSandbox {
  readonly pluginDir: string
  /** Runs a shell command as the unprivileged user. A non-zero exit is returned, not thrown. */
  run(command: string): Promise<CommandOutput>
}

export interface TerminalOptions {
  cols: number
  rows: number
  cwd: string
  envs: Record<string, string>
  onData: (bytes: Uint8Array) => void
}

/** A pty running the user's login shell. */
export interface Terminal {
  send(input: string): Promise<void>
  kill(): Promise<void>
}

export type SandboxFile = { path: string; data: string | Uint8Array }

/** What recording a session needs on top of importing: files, env and a terminal. */
export interface RecordingSandbox extends ModSandbox {
  run(command: string, envs?: Record<string, string>): Promise<CommandOutput>
  writeFiles(files: SandboxFile[]): Promise<void>
  openTerminal(options: TerminalOptions): Promise<Terminal>
}

export interface BoundedRunOptions {
  timeoutMs: number
  /** Past this many bytes of stdout and stderr together, the command is killed and the run fails. */
  maxOutputBytes: number
}

/** A fresh sandbox no mod code has run in, for parsing a recording's hostile bytes. */
export interface ReplaySandbox {
  writeFiles(files: SandboxFile[]): Promise<void>
  /** Runs as the unprivileged user; a non-zero exit is returned, a timeout or overflow thrown. */
  runBounded(command: string, options: BoundedRunOptions): Promise<CommandOutput>
}

export interface ModSource {
  tarball: Uint8Array
  /** Validated by `parseCuration` (letters, digits, `.`, `_`, `-`, `/`), so it is safe inside the double quotes in `unpackCommand`. */
  path: string
}

/**
 * GitHub tarballs wrap the repository in one top-level folder, so strip it plus `path`. The member
 * is named exactly under that folder; a wildcard would also match `<path>` nested elsewhere.
 */
function unpackCommand(path: string): string {
  const depth = path === '' ? 0 : path.split('/').length
  const member = path === '' ? '' : ` "$top/${path}"`
  return [
    `mkdir -p ${PLUGIN_DIR}`,
    `top="$(tar -tzf ${TARBALL_PATH} | head -n 1 | cut -d/ -f1)"`,
    `tar -xzf ${TARBALL_PATH} -C ${PLUGIN_DIR} --strip-components=${depth + 1}${member}`,
    `test -f ${PLUGIN_DIR}/.claude-plugin/plugin.json`,
  ].join(' && ')
}

async function run(
  sandbox: Sandbox,
  command: string,
  envs: Record<string, string> = {},
): Promise<CommandOutput> {
  try {
    const { exitCode, stdout, stderr } = await sandbox.commands.run(command, {
      user: SANDBOX_USER,
      timeoutMs: COMMAND_TIMEOUT_MS,
      envs,
    })
    return { exitCode, stdout, stderr }
  } catch (error) {
    if (!(error instanceof CommandExitError)) throw error
    return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
  }
}

async function runBounded(
  sandbox: Sandbox,
  command: string,
  { timeoutMs, maxOutputBytes }: BoundedRunOptions,
): Promise<CommandOutput> {
  let outputBytes = 0
  let handle: CommandHandle | undefined
  let stopped = false
  const overflowed = () => outputBytes > maxOutputBytes
  /** Disconnecting stops the SDK buffering output at once, whether or not the kill lands. */
  const stopIfOverflowed = async () => {
    if (!overflowed() || stopped || !handle) return
    stopped = true
    await handle.disconnect()
    await handle.kill().catch(() => false)
  }
  const count = (data: string) => {
    outputBytes += Buffer.byteLength(data)
    void stopIfOverflowed().catch(() => {})
  }
  handle = await sandbox.commands.run(command, {
    background: true,
    user: SANDBOX_USER,
    timeoutMs,
    onStdout: count,
    onStderr: count,
  })
  await stopIfOverflowed()
  const result = await handle.wait().catch((error: unknown) => {
    if (overflowed() || error instanceof TimeoutError) return null
    if (error instanceof CommandExitError) return error
    throw error
  })
  if (overflowed()) throw new Error(`command output passed ${maxOutputBytes} bytes`)
  if (!result) throw new Error(`command ran past ${timeoutMs} ms`)
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
}

const arrayBuffer = ({ buffer, byteOffset, byteLength }: Uint8Array) =>
  buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer

async function writeFiles(sandbox: Sandbox, files: SandboxFile[]): Promise<void> {
  await sandbox.files.write(
    files.map(({ path, data }) => ({
      path,
      data: typeof data === 'string' ? data : arrayBuffer(data),
    })),
    { user: SANDBOX_USER },
  )
}

async function unpack(sandbox: Sandbox, source: ModSource): Promise<void> {
  await writeFiles(sandbox, [{ path: TARBALL_PATH, data: source.tarball }])
  const unpacked = await run(sandbox, unpackCommand(source.path))
  if (unpacked.exitCode !== 0) {
    const where = source.path === '' ? 'the repository root' : `"${source.path}"`
    throw new Error(`no .claude-plugin/plugin.json at ${where}: ${unpacked.stderr.trim()}`)
  }
}

async function openTerminal(sandbox: Sandbox, options: TerminalOptions): Promise<Terminal> {
  const { cols, rows, cwd, envs, onData } = options
  const pty = await sandbox.pty.create({
    cols,
    rows,
    cwd,
    envs,
    user: SANDBOX_USER,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    onData,
  })
  return {
    send: (input) => sandbox.pty.sendInput(pty.pid, new TextEncoder().encode(input)),
    kill: async () => {
      await sandbox.pty.kill(pty.pid).catch(() => false)
    },
  }
}

async function withSandbox<T>(
  timeoutMs: number,
  use: (sandbox: Sandbox) => Promise<T>,
): Promise<T> {
  const sandbox = await Sandbox.create(E2B_MOD_TEMPLATE_ID, {
    apiKey: requireEnv('E2B_API_KEY'),
    ...buildNetworkOption([]),
    timeoutMs,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    secure: true,
  })
  try {
    return await use(sandbox)
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

/** The tarball's bytes never touch the host's filesystem. */
export function withRecordingSandbox<T>(
  source: ModSource | null,
  use: (sandbox: RecordingSandbox) => Promise<T>,
): Promise<T> {
  return withSandbox(SANDBOX_TIMEOUT_MS, async (sandbox) => {
    if (source) await unpack(sandbox, source)
    return use({
      pluginDir: PLUGIN_DIR,
      run: (command, envs) => run(sandbox, command, envs),
      writeFiles: (files) => writeFiles(sandbox, files),
      openTerminal: (options) => openTerminal(sandbox, options),
    })
  })
}

export function withReplaySandbox<T>(use: (sandbox: ReplaySandbox) => Promise<T>): Promise<T> {
  return withSandbox(REPLAY_SANDBOX_TIMEOUT_MS, (sandbox) =>
    use({
      writeFiles: (files) => writeFiles(sandbox, files),
      runBounded: (command, options) => runBounded(sandbox, command, options),
    }),
  )
}

export function withModSandbox<T>(
  source: ModSource,
  use: (sandbox: ModSandbox) => Promise<T>,
): Promise<T> {
  return withRecordingSandbox(source, use)
}
