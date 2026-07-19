import { CommandExitError, type CommandResult, Sandbox, TimeoutError } from 'e2b'
import { requireEnv } from '@/lib/env'
import { externalNetworkHosts, shouldMockAnthropicUsage } from './anthropic-usage-mock'
import {
  anthropicUsageMockFiles,
  anthropicUsageSetupScript,
  withAnthropicUsageEnv,
} from './anthropic-usage-sandbox'
import { buildNetworkOption } from './e2b-network'
import { E2B_TEMPLATE_ID } from './e2b-template'
import { scriptExtension } from './script-extension'
import { parseStrace } from './strace'
import type { Interpreter, RenderInput, RenderResult, SandboxRunner } from './types'

/** Hard per-command wall-clock cap. Untrusted scripts get single-digit seconds. */
const COMMAND_TIMEOUT_MS = 5000
/** Sandbox lifetime ceiling. The `finally` kill is the real teardown; this is a backstop. */
const SANDBOX_TIMEOUT_MS = 30_000
/** Longer caps for network renders (both constants): a live fetch needs more than the 5s/30s
 * offline budget. The `finally` kill still bounds a stuck network sandbox. */
const NETWORK_COMMAND_TIMEOUT_MS = 15_000 // per-command cap when hosts are declared
const NETWORK_SANDBOX_TIMEOUT_MS = 45_000 // sandbox lifetime cap when hosts are declared

/** Exit code we report when the script is killed by the timeout. */
const TIMEOUT_EXIT_CODE = 124
/** Exit code we report when our own infra (RPC, sandbox) failed — NOT a script timeout. */
const INFRA_ERROR_EXIT_CODE = 125

/** Scenario-derived working dir must look like this (absolute, under /home/user). */
const SAFE_DIR_PATTERN = /^\/home\/user\/[A-Za-z0-9._/-]+$/
/** Scenario-derived git branch must look like this. */
const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/

/** Fixture paths are scenario-derived; validate them like every other scenario value (H1:
 *  scenarios will become DB-backed/untrusted). Charset check + explicit '..' rejection. */
export function assertSafeFixturePaths(fixtures: { path: string; content: string }[]): void {
  for (const f of fixtures) {
    if (!SAFE_DIR_PATTERN.test(f.path) || f.path.includes('..')) {
      throw new Error(`unsafe fixture path: ${f.path}`)
    }
  }
}

/**
 * Only these env vars are forwarded to the untrusted script per the spec. Scenarios will become
 * DB-backed/untrusted, so don't let one set PATH/LD_PRELOAD/NODE_OPTIONS for the script.
 */
const ALLOWED_ENV = ['COLUMNS', 'LINES']

const RUN_CMD: Record<Interpreter, string> = { bash: 'bash', node: 'node', python: 'python3' }

const SCRIPT_DIR = '/home/user'
const INPUT_PATH = `${SCRIPT_DIR}/input.json`
const TRACE_PATH = '/tmp/trace.log'
const SANDBOX_USER = 'user'

/** Fixed renderer-owned env is merged after scenario filtering, so scenarios cannot override it. */
export function buildRunEnv(
  scenarioEnv: Record<string, string>,
  mockAnthropicUsage: boolean,
): Record<string, string> {
  const env = filterEnv(scenarioEnv)
  if (!mockAnthropicUsage) return env
  return withAnthropicUsageEnv(env)
}

/**
 * Runs an untrusted statusline script inside a fresh E2B sandbox.
 *
 * Security invariants (do not weaken):
 * - Default: `allowInternetAccess: false` (no hosts). A declared, admin-approved host list
 *   switches to deny-all + allow policy via `buildNetworkOption`.
 * - Every command has a hard `timeoutMs`; the SDK timeout does NOT kill the sandbox.
 * - `sandbox.kill()` runs in `finally` on every path — success, error, or throw — so a
 *   leaked sandbox can never bill indefinitely (denial-of-wallet).
 * - One sandbox per `render()` call; never reused.
 */
export class E2BSandboxRunner implements SandboxRunner {
  async render(input: RenderInput): Promise<RenderResult> {
    const apiKey = requireEnv('E2B_API_KEY')
    const declaredHosts = input.networkHosts ?? []
    const mockAnthropicUsage = shouldMockAnthropicUsage(input)
    const hosts = externalNetworkHosts(declaredHosts, mockAnthropicUsage)
    const networkOption = buildNetworkOption(hosts)
    const commandTimeoutMs =
      declaredHosts.length > 0 ? NETWORK_COMMAND_TIMEOUT_MS : COMMAND_TIMEOUT_MS
    const sandboxTimeoutMs =
      declaredHosts.length > 0 ? NETWORK_SANDBOX_TIMEOUT_MS : SANDBOX_TIMEOUT_MS
    const fixtures = input.fixtures ?? []
    assertSafeFixturePaths(fixtures)
    const sandbox = await Sandbox.create(E2B_TEMPLATE_ID, {
      apiKey,
      ...networkOption,
      timeoutMs: sandboxTimeoutMs,
    })
    try {
      // H1/M2: scenario values are interpolated into bash in `setupScript`. Treat them as
      // hostile by contract (they will become DB-backed) and validate before any use.
      const dir = workspaceDir(input)
      const branch = input.scenario.git?.branch
      if (branch !== undefined && !SAFE_BRANCH_PATTERN.test(branch)) {
        throw new Error('unsafe scenario value: git.branch')
      }
      const ext = scriptExtension(input.interpreter, input.script)
      const scriptPath = `${SCRIPT_DIR}/statusline.${ext}`

      const files = [
        { path: scriptPath, data: input.script },
        { path: INPUT_PATH, data: JSON.stringify(input.scenario.stdin) },
        ...fixtures.map((f) => ({ path: f.path, data: f.content })),
      ]

      if (mockAnthropicUsage) {
        try {
          files.push(...anthropicUsageMockFiles(input.scenario.stdin))
          await sandbox.files.write(files)
          await sandbox.commands.run(anthropicUsageSetupScript(), {
            timeoutMs: commandTimeoutMs,
            user: 'root',
          })
        } catch (error: unknown) {
          return infrastructureError(
            `Anthropic usage mock setup failed: ${commandErrorDetails(error)}`,
          )
        }
      } else {
        await sandbox.files.write(files)
      }

      try {
        await sandbox.commands.run(setupScript(dir, input.scenario.git), {
          timeoutMs: commandTimeoutMs,
          user: SANDBOX_USER,
        })
      } catch (error: unknown) {
        // Setup failing = we couldn't prepare the env = infra error, not a script result.
        return {
          exitCode: INFRA_ERROR_EXIT_CODE,
          stderr: String(error),
          stdout: '',
          timedOut: false,
          trace: parseStrace(''),
        }
      }

      const runCmd = `${RUN_CMD[input.interpreter]} ${scriptPath} < ${INPUT_PATH}`

      let timedOut = false
      const result = await sandbox.commands
        .run(runCmd, {
          cwd: dir,
          envs: buildRunEnv(input.scenario.env, mockAnthropicUsage),
          timeoutMs: commandTimeoutMs,
          user: SANDBOX_USER,
        })
        .catch((error: unknown): CommandResult => {
          // A non-zero exit from the script is a legitimate result, not a failure of ours.
          if (error instanceof CommandExitError) {
            return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
          }
          // The hard timeout fired: the script ran too long.
          if (error instanceof TimeoutError) {
            timedOut = true
            return { exitCode: TIMEOUT_EXIT_CODE, stdout: '', stderr: error.message }
          }
          // Anything else (RPC failure, sandbox infra, etc.) is OUR failure, not a timeout.
          // Distinct sentinel exit code; leave timedOut false so we don't mislabel infra as slow scripts.
          return { exitCode: INFRA_ERROR_EXIT_CODE, stdout: '', stderr: String(error) }
        })

      const traceLog = await sandbox.files.read(TRACE_PATH).catch(() => '')

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut,
        trace: parseStrace(traceLog),
      }
    } finally {
      // Teardown is best-effort: a kill RPC failure must not mask the real result or error.
      await sandbox.kill().catch(() => {})
    }
  }
}

function commandErrorDetails(error: unknown): string {
  if (error instanceof CommandExitError) {
    return `${String(error)}\nstdout: ${error.stdout}\nstderr: ${error.stderr}`
  }
  return String(error)
}

function infrastructureError(stderr: string): RenderResult {
  return {
    exitCode: INFRA_ERROR_EXIT_CODE,
    stderr,
    stdout: '',
    timedOut: false,
    trace: parseStrace(''),
  }
}

/** Forward only the allowlisted env vars to the untrusted script; drop everything else. */
function filterEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of ALLOWED_ENV) {
    const val = env[key]
    if (val !== undefined) out[key] = val
  }
  return out
}

function workspaceDir(input: RenderInput): string {
  // M2: no unsound cast — guard the shape before trusting it.
  const workspace = input.scenario.stdin.workspace
  const currentDir =
    workspace && typeof workspace === 'object'
      ? (workspace as Record<string, unknown>).current_dir
      : undefined
  if (typeof currentDir !== 'string') {
    throw new Error('scenario stdin.workspace.current_dir is required')
  }
  // H1: this value is interpolated into bash in `setupScript`; reject anything but a safe path.
  if (!SAFE_DIR_PATTERN.test(currentDir)) {
    throw new Error('unsafe scenario value: workspace.current_dir')
  }
  return currentDir
}

function setupScript(dir: string, git: { branch: string; dirty: boolean } | null): string {
  const lines = [`mkdir -p ${dir}`, `cd ${dir}`]
  if (git) {
    lines.push(
      'git init -q',
      `git checkout -q -b ${git.branch}`,
      'git config user.email a@b.c',
      'git config user.name a',
      'echo seed > .seed',
      'git add -A',
      'git commit -qm seed',
    )
    if (git.dirty) lines.push('echo change >> .seed', 'echo new > untracked.txt')
  }
  return lines.join(' && ')
}
