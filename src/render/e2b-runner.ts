import { CommandExitError, type CommandResult, Sandbox, TimeoutError } from 'e2b'
import { requireEnv } from '@/lib/env'
import { E2B_TEMPLATE_NAME } from './e2b-template'
import type { BehaviorTrace, Interpreter, RenderInput, RenderResult, SandboxRunner } from './types'

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

/** Cap how many trace lines we parse, so a flood of syscalls can't exhaust CPU/memory. */
const MAX_TRACE_LINES = 5000
/** Cap how many entries we keep per trace category. */
const MAX_TRACE_ENTRIES = 200

/** Paths a hostile script might read to exfiltrate credentials; flagged in the trace. */
const SENSITIVE_PATHS = ['/root/.ssh', '/home/user/.ssh', '.aws', '.gitconfig', '/etc/passwd']

/**
 * Only these env vars are forwarded to the untrusted script per the spec. Scenarios will become
 * DB-backed/untrusted, so don't let one set PATH/LD_PRELOAD/NODE_OPTIONS for the script.
 */
const ALLOWED_ENV = ['COLUMNS', 'LINES']

const SCRIPT_EXT: Record<Interpreter, string> = { bash: 'sh', node: 'mjs', python: 'py' }
const RUN_CMD: Record<Interpreter, string> = { bash: 'bash', node: 'node', python: 'python3' }

const SCRIPT_DIR = '/home/user'
const INPUT_PATH = `${SCRIPT_DIR}/input.json`
const TRACE_PATH = '/tmp/trace.log'
const SANDBOX_USER = 'user'

/** E2B REJECTS `::/0` as a deny CIDR (400 error), so IPv6 deny-all is omitted. The deny-all-IPv4
 * + allowlist model already blocks non-declared hosts (verified against live E2B). Internal ranges
 * are belt-and-suspenders — E2B denies them by default. `denyOut` takes CIDRs/IPs only, not domains. */
const NETWORK_DENY_OUT = [
  '0.0.0.0/0',
  '169.254.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '::1/128', // IPv6 loopback
  'fc00::/7', // IPv6 unique-local
  'fe80::/10', // IPv6 link-local
]

type NetworkOption =
  | { allowInternetAccess: false }
  | { network: { denyOut: string[]; allowOut: string[] } }

/** Build the E2B egress option. No hosts → network off. Hosts → deny-all + internal denies, then
 * allow the declared hosts (allow beats deny for the listed names only). */
export function buildNetworkOption(networkHosts: string[]): NetworkOption {
  if (networkHosts.length === 0) return { allowInternetAccess: false }
  return { network: { denyOut: [...NETWORK_DENY_OUT], allowOut: [...networkHosts] } }
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
    const hosts = input.networkHosts ?? []
    const networkOption = buildNetworkOption(hosts)
    const commandTimeoutMs = hosts.length > 0 ? NETWORK_COMMAND_TIMEOUT_MS : COMMAND_TIMEOUT_MS
    const sandboxTimeoutMs = hosts.length > 0 ? NETWORK_SANDBOX_TIMEOUT_MS : SANDBOX_TIMEOUT_MS
    // Custom template (built by `bun run build:e2b-template`) bakes in jq/bc/gawk/column so real
    // statuslines render faithfully — the base image lacks them and the sandbox has no network.
    const sandbox = await Sandbox.create(E2B_TEMPLATE_NAME, {
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
      const ext = SCRIPT_EXT[input.interpreter]
      const scriptPath = `${SCRIPT_DIR}/statusline.${ext}`

      await sandbox.files.write([
        { path: scriptPath, data: input.script },
        { path: INPUT_PATH, data: JSON.stringify(input.scenario.stdin) },
      ])

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

      // strace is now baked into the custom template, but it's NOT yet wired into the run
      // command. Slice 6 must run strace as root with a write-protected sink before the trace
      // is authoritative — see parseStrace's note. Until that wiring lands we run the script
      // directly; the trace file never appears, so parseStrace yields an empty (and
      // already-non-authoritative) trace.
      const runCmd = `${RUN_CMD[input.interpreter]} ${scriptPath} < ${INPUT_PATH}`

      let timedOut = false
      const result = await sandbox.commands
        .run(runCmd, {
          cwd: dir,
          envs: filterEnv(input.scenario.env),
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

/**
 * Parses the strace output into a behavior trace.
 *
 * BEST-EFFORT, NOT YET AUTHORITATIVE. Do not gate auto-reject or transparency-badge logic
 * on this trace as it stands today:
 * - The trace file lives in a world-writable path (`/tmp`) and strace runs in the traced
 *   process's own user context, so a hostile script can poison or truncate it.
 * - Spawn (execve) detection is incomplete and can be evaded.
 *
 * Slice 3/6 must run strace as root with a write-protected sink before anything trusts this.
 * Until then, treat an empty/clean trace as "needs human review," NEVER as "safe."
 */
function parseStrace(log: string): BehaviorTrace {
  const networkAttempts: string[] = []
  const sensitiveReads: string[] = []
  const spawnedProcesses: string[] = []
  const push = (arr: string[], line: string): void => {
    if (arr.length < MAX_TRACE_ENTRIES) arr.push(line.trim().slice(0, 200))
  }
  // Bound the read: a hostile script can emit millions of syscalls.
  const lines = log.split('\n', MAX_TRACE_LINES)
  for (const line of lines) {
    if (/\bconnect\(/.test(line)) push(networkAttempts, line)
    if (/\bopenat\(/.test(line) && SENSITIVE_PATHS.some((p) => line.includes(p))) {
      push(sensitiveReads, line)
    }
    if (line.includes('execve(')) push(spawnedProcesses, line)
  }
  return { networkAttempts, sensitiveReads, spawnedProcesses }
}
