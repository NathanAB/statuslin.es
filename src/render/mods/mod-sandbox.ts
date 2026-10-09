import { CommandExitError, Sandbox } from 'e2b'
import { requireEnv } from '@/lib/env'
import { buildNetworkOption } from '../e2b-network'
import { E2B_MOD_TEMPLATE_ID } from '../e2b-template'

const SANDBOX_USER = 'user'
const TARBALL_PATH = '/home/user/.statuslines/mod.tar.gz'
const PLUGIN_DIR = '/home/user/plugins/mod'
/** Sandbox lifetime ceiling. The `finally` kill is the real teardown; this is a backstop. */
const SANDBOX_TIMEOUT_MS = 5 * 60_000
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

async function run(sandbox: Sandbox, command: string): Promise<CommandOutput> {
  try {
    const { exitCode, stdout, stderr } = await sandbox.commands.run(command, {
      user: SANDBOX_USER,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
    return { exitCode, stdout, stderr }
  } catch (error) {
    if (!(error instanceof CommandExitError)) throw error
    return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
  }
}

/** Internet is off, and the tarball's bytes never touch the host's filesystem. */
export async function withModSandbox<T>(
  source: ModSource,
  use: (sandbox: ModSandbox) => Promise<T>,
): Promise<T> {
  const sandbox = await Sandbox.create(E2B_MOD_TEMPLATE_ID, {
    apiKey: requireEnv('E2B_API_KEY'),
    ...buildNetworkOption([]),
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })
  try {
    const { buffer, byteOffset, byteLength } = source.tarball
    await sandbox.files.write(
      TARBALL_PATH,
      buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer,
      { user: SANDBOX_USER },
    )
    const unpacked = await run(sandbox, unpackCommand(source.path))
    if (unpacked.exitCode !== 0) {
      const where = source.path === '' ? 'the repository root' : `"${source.path}"`
      throw new Error(`no .claude-plugin/plugin.json at ${where}: ${unpacked.stderr.trim()}`)
    }
    return await use({ pluginDir: PLUGIN_DIR, run: (command) => run(sandbox, command) })
  } finally {
    await sandbox.kill().catch(() => {})
  }
}
