import { CommandExitError, Sandbox } from 'e2b'
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
export const SANDBOX_TIMEOUT_MS = 5 * 60_000
const COMMAND_TIMEOUT_MS = 60_000

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

/** What recording a session needs on top of importing: files, env and a terminal. */
export interface RecordingSandbox extends ModSandbox {
  run(command: string, envs?: Record<string, string>): Promise<CommandOutput>
  writeFiles(files: { path: string; data: string | Uint8Array }[]): Promise<void>
  openTerminal(options: TerminalOptions): Promise<Terminal>
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

const arrayBuffer = ({ buffer, byteOffset, byteLength }: Uint8Array) =>
  buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer

async function unpack(sandbox: Sandbox, source: ModSource): Promise<void> {
  await sandbox.files.write(TARBALL_PATH, arrayBuffer(source.tarball), { user: SANDBOX_USER })
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

/**
 * Internet is off, and the tarball's bytes never touch the host's filesystem. A null source opens
 * the same sandbox with no mod, for the baseline recording.
 */
export async function withRecordingSandbox<T>(
  source: ModSource | null,
  use: (sandbox: RecordingSandbox) => Promise<T>,
): Promise<T> {
  const sandbox = await Sandbox.create(E2B_MOD_TEMPLATE_ID, {
    apiKey: requireEnv('E2B_API_KEY'),
    ...buildNetworkOption([]),
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })
  try {
    if (source) await unpack(sandbox, source)
    return await use({
      pluginDir: PLUGIN_DIR,
      run: (command, envs) => run(sandbox, command, envs),
      writeFiles: (files) =>
        sandbox.files
          .write(
            files.map(({ path, data }) => ({
              path,
              data: typeof data === 'string' ? data : arrayBuffer(data),
            })),
            { user: SANDBOX_USER },
          )
          .then(() => {}),
      openTerminal: (options) => openTerminal(sandbox, options),
    })
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

export function withModSandbox<T>(
  source: ModSource,
  use: (sandbox: ModSandbox) => Promise<T>,
): Promise<T> {
  return withRecordingSandbox(source, use)
}
