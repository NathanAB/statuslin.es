// biome-ignore-all lint/style/useNamingConvention: env var names and Claude Code config keys are external contracts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CommandExitError, Sandbox } from 'e2b'
import { CLAUDE_CODE_VERSION } from '../scripts/build-e2b-template'
import { cannedRateLimitHeaders, cannedUsage, cleanMainStdin, feedValues } from './feed-values'
import { type InputStep, KEYS, type ModSource } from './mods'
import { SPIKE_TEMPLATE } from './template'

export const COLS = 100
export const ROWS = 30

const SPIKE_DIR = import.meta.dirname
const HOME = '/home/user/cc-home'
const CONFIG_DIR = `${HOME}/.claude`
const WORK = '/home/user/.statuslines'
const PLUGINS = '/home/user/plugins'
const FEED_DIR = `${PLUGINS}/scenario-feed`
const MOD_DIR = `${PLUGINS}/mod`
const SERVER_PORT = 8787
const FAKE_API_KEY = `sk-ant-api03-${'statuslinespreview'.padEnd(80, '0')}-AA`
const CANNED_REPLY_TEXT = 'The repo is clean and the tests pass.'
const SCRIPTED_PROMPT = 'hello'

const QUIET_MS = 2000
const READY_MAX_MS = 60_000
const TURN_MAX_MS = 45_000
const STEP_MAX_MS = 20_000
const SANDBOX_TIMEOUT_MS = 5 * 60_000

export type ScreenRow = { ansi: string; plain: string }
export type Screen = { isAlternate: boolean; cursorY: number; screen: ScreenRow[] }
export type CallRecord = { plugin: string; event: string; answered: boolean }

export type CaptureResult = {
  screen: Screen
  /** Each phase in ms, measured on the host. */
  timings: {
    sandboxCreate: number
    setup: number
    claudeColdVersion: number
    validate: number
    claudeReady: number
    turn: number
    steps: number
    replay: number
    total: number
  }
  claudeRssKb: number | null
  sandboxMemUsedMb: number | null
  validate: { exitCode: number; stdout: string; stderr: string } | null
  /** The mod's plugin.json name, null for the baseline. */
  pluginName: string | null
  calls: CallRecord[]
  requestLog: string[]
  rawBytes: number
  timedOutPhases: string[]
}

export type CaptureMod = { source: ModSource; tarball: Uint8Array }

const ms = (from: number) => Math.round(performance.now() - from)

function claudeJson(): string {
  const workspace = cleanMainStdin().workspace.current_dir
  return JSON.stringify({
    hasCompletedOnboarding: true,
    lastOnboardingVersion: CLAUDE_CODE_VERSION,
    numStartups: 5,
    theme: 'dark',
    autoUpdates: false,
    customApiKeyResponses: { approved: [FAKE_API_KEY.slice(-20)], rejected: [] },
    projects: {
      [workspace]: {
        hasTrustDialogAccepted: true,
        hasCompletedProjectOnboarding: true,
        projectOnboardingSeenCount: 5,
        allowedTools: [],
      },
    },
  })
}

function claudeEnv(): Record<string, string> {
  return {
    HOME,
    CLAUDE_CONFIG_DIR: CONFIG_DIR,
    ANTHROPIC_API_KEY: FAKE_API_KEY,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${SERVER_PORT}`,
    DISABLE_TELEMETRY: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'C.UTF-8',
  }
}

function feedFiles() {
  const local = (p: string) => readFileSync(join(SPIKE_DIR, 'scenario-feed', p), 'utf8')
  return ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.ts'].map((p) => ({
    path: `${FEED_DIR}/${p}`,
    data: local(p),
  }))
}

function setupScript(mod: CaptureMod | undefined): string {
  const workspace = cleanMainStdin().workspace.current_dir
  const lines = [
    `mkdir -p ${workspace} ${CONFIG_DIR}`,
    `cp ${HOME}/.claude.json ${CONFIG_DIR}/.claude.json`,
    `cd ${workspace}`,
    'git init -q -b main',
    'git config user.email a@b.c',
    'git config user.name a',
    'git remote add origin https://github.com/acme/app.git',
    'echo seed > README.md',
    'git add -A',
    'git commit -qm seed',
  ]
  if (mod) {
    const strip = 1 + (mod.source.path ? mod.source.path.split('/').length : 0)
    const member = mod.source.path ? `'*/${mod.source.path}/*'` : ''
    lines.push(
      `mkdir -p ${MOD_DIR}`,
      `tar -xzf ${WORK}/mod.tar.gz -C ${MOD_DIR} --strip-components=${strip} --wildcards ${member}`.trim(),
      `test -f ${MOD_DIR}/.claude-plugin/plugin.json`,
      `jq -r .name ${MOD_DIR}/.claude-plugin/plugin.json > ${WORK}/target-plugin`,
    )
  }
  lines.push(
    `(nohup python3 ${WORK}/server.py --listen 127.0.0.1 --port ${SERVER_PORT} --canned-reply ${WORK}/reply.json --request-log ${WORK}/requests.log >${WORK}/server.out 2>&1 &)`,
    `for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:${SERVER_PORT}/ && exit 0; sleep 0.1; done; cat ${WORK}/server.out >&2; exit 1`,
  )
  return lines.join(' && ')
}

/** Polls until the pty has been silent for `quietMs`, or `maxMs` passes. Returns true when quiet. */
async function waitQuiet(lastDataAt: () => number, maxMs: number, quietMs = QUIET_MS) {
  const started = performance.now()
  while (performance.now() - started < maxMs) {
    if (performance.now() - lastDataAt() >= quietMs) return true
    await Bun.sleep(100)
  }
  return false
}

const encode = (s: string) => new TextEncoder().encode(s)

async function runQuiet(sandbox: Sandbox, cmd: string, envs: Record<string, string> = {}) {
  try {
    const r = await sandbox.commands.run(cmd, { envs, timeoutMs: 60_000, user: 'user' })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (error) {
    if (error instanceof CommandExitError) {
      return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
    }
    throw error
  }
}

function stepInput(step: InputStep): string | null {
  if (step.type === 'text') return step.text
  if (step.type === 'keys') return step.keys.map((k) => KEYS[k]).join('')
  return null
}

/** A pty in the sandbox whose output is collected on the host, with input and quiet detection. */
async function openTerminal(sandbox: Sandbox) {
  const chunks: Uint8Array[] = []
  let lastDataAt = performance.now()
  const pty = await sandbox.pty.create({
    cols: COLS,
    rows: ROWS,
    cwd: cleanMainStdin().workspace.current_dir,
    envs: claudeEnv(),
    user: 'user',
    timeoutMs: SANDBOX_TIMEOUT_MS,
    onData: (data) => {
      chunks.push(data)
      lastDataAt = performance.now()
    },
  })
  // Input counts as activity, so a quiet wait right after it waits for the echo and the redraw.
  const send = async (text: string) => {
    await sandbox.pty.sendInput(pty.pid, encode(text))
    lastDataAt = performance.now()
  }
  return {
    chunks,
    lastDataAt: () => lastDataAt,
    send,
    async typeLine(text: string) {
      await send(text)
      await Bun.sleep(200)
      await send(KEYS.enter)
    },
    waitQuiet: (maxMs: number) => waitQuiet(() => lastDataAt, maxMs),
    kill: () => sandbox.pty.kill(pty.pid).catch(() => false),
  }
}
type Term = Awaited<ReturnType<typeof openTerminal>>

async function applySteps(term: Term, steps: InputStep[], timedOutPhases: string[]) {
  for (const step of steps) {
    const input = stepInput(step)
    if (input === null) {
      await Bun.sleep(step.type === 'wait' ? step.ms : 0)
      continue
    }
    if (step.type === 'text' && step.submit !== false) await term.typeLine(input)
    else await term.send(input)
    if (!(await term.waitQuiet(STEP_MAX_MS))) timedOutPhases.push('step')
  }
}

async function replayScreen(sandbox: Sandbox, raw: Buffer): Promise<Screen> {
  await sandbox.files.write(
    `${WORK}/capture.bin`,
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
  )
  const replay = await runQuiet(
    sandbox,
    `node ${WORK}/replay.cjs ${WORK}/capture.bin ${COLS} ${ROWS}`,
  )
  if (replay.exitCode !== 0) throw new Error(`replay failed: ${replay.stderr}`)
  return JSON.parse(replay.stdout) as Screen
}

async function readJson<T>(sandbox: Sandbox, path: string, fallback: T): Promise<T> {
  return sandbox.files
    .read(path)
    .then((t) => JSON.parse(t) as T)
    .catch(() => fallback)
}

function sandboxFiles() {
  return [
    ...feedFiles(),
    { path: `${HOME}/.claude.json`, data: claudeJson() },
    { path: `${WORK}/feed.json`, data: JSON.stringify(feedValues(Date.now())) },
    {
      path: `${WORK}/reply.json`,
      data: JSON.stringify({
        text: CANNED_REPLY_TEXT,
        usage: cannedUsage(),
        headers: cannedRateLimitHeaders(Date.now()),
      }),
    },
    {
      path: `${WORK}/server.py`,
      data: readFileSync(
        join(SPIKE_DIR, '..', 'src/render/sandbox-anthropic-usage-server.py'),
        'utf8',
      ),
    },
    {
      path: `${WORK}/replay.cjs`,
      data: readFileSync(join(SPIKE_DIR, 'sandbox/replay.cjs'), 'utf8'),
    },
  ]
}

/** One fresh sandbox: Claude Code with the scenario feed (and the mod, if given) after one turn. */
export async function capture(apiKey: string, mod?: CaptureMod): Promise<CaptureResult> {
  const t0 = performance.now()
  const timedOutPhases: string[] = []
  const sandbox = await Sandbox.create(SPIKE_TEMPLATE, {
    apiKey,
    allowInternetAccess: false,
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })
  const sandboxCreate = ms(t0)
  try {
    const tSetup = performance.now()
    await sandbox.files.write(sandboxFiles())
    if (mod) {
      const { buffer, byteOffset, byteLength } = mod.tarball
      await sandbox.files.write(
        `${WORK}/mod.tar.gz`,
        buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer,
      )
    }
    const setup = await runQuiet(sandbox, setupScript(mod))
    if (setup.exitCode !== 0) throw new Error(`setup failed: ${setup.stderr || setup.stdout}`)
    const setupMs = ms(tSetup)

    const tVersion = performance.now()
    await runQuiet(sandbox, 'claude --version', claudeEnv())
    const claudeColdVersion = ms(tVersion)
    const tValidate = performance.now()
    const validate = await runQuiet(
      sandbox,
      `claude plugin validate --json ${mod ? MOD_DIR : FEED_DIR}`,
      claudeEnv(),
    )
    const validateMs = ms(tValidate)

    const term = await openTerminal(sandbox)
    const pluginDirs = [FEED_DIR, ...(mod ? [MOD_DIR] : [])].map((d) => `--plugin-dir ${d}`)
    await term.waitQuiet(1000)
    const bytesBeforeLaunch = term.chunks.length
    await term.send(
      `clear; exec claude --model ${cleanMainStdin().model.id} ${pluginDirs.join(' ')}\r`,
    )
    const tLaunch = performance.now()
    if (!(await term.waitQuiet(READY_MAX_MS))) timedOutPhases.push('ready')
    const claudeReady = Math.round(term.lastDataAt() - tLaunch)

    const tTurn = performance.now()
    await term.typeLine(SCRIPTED_PROMPT)
    if (!(await term.waitQuiet(TURN_MAX_MS))) timedOutPhases.push('turn')
    const turnMs = Math.round(term.lastDataAt() - tTurn)

    const tSteps = performance.now()
    await applySteps(term, mod?.source.steps ?? [], timedOutPhases)
    const stepsMs = ms(tSteps)

    const ps = await runQuiet(
      sandbox,
      'ps -C claude -o rss= | sort -n | tail -1; free -m | awk "/Mem:/{print \\$3}"',
    )
    const [rss, memUsed] = ps.stdout.trim().split('\n')
    await term.kill()

    const tReplay = performance.now()
    const raw = Buffer.concat(term.chunks.slice(bytesBeforeLaunch))
    const screen = await replayScreen(sandbox, raw)
    const replayMs = ms(tReplay)

    const calls = await readJson<CallRecord[]>(sandbox, `${WORK}/calls.json`, [])
    const pluginName = mod
      ? (await sandbox.files.read(`${WORK}/target-plugin`).catch(() => '')).trim() || null
      : null
    const requestLog = (await sandbox.files.read(`${WORK}/requests.log`).catch(() => ''))
      .split('\n')
      .filter(Boolean)

    return {
      screen,
      timings: {
        sandboxCreate,
        setup: setupMs,
        claudeColdVersion,
        validate: validateMs,
        claudeReady,
        turn: turnMs,
        steps: stepsMs,
        replay: replayMs,
        total: ms(t0),
      },
      claudeRssKb: rss ? Number(rss) : null,
      sandboxMemUsedMb: memUsed ? Number(memUsed) : null,
      validate,
      pluginName,
      calls,
      requestLog,
      rawBytes: raw.byteLength,
      timedOutPhases,
    }
  } finally {
    await sandbox.kill().catch(() => {})
  }
}
