// biome-ignore-all lint/style/useNamingConvention: wire keys and env var names are external contracts.
/**
 * SPIKE (throwaway, never merged): can Claude Code in the mods E2B sandbox, driven over
 * stream-json the way Claude Desktop's Agent SDK drives it, hand back the mod layout trees Desktop
 * draws? Writes one transcript per mod to docs/research/desktop-spike/ (gitignored).
 *
 *   bun scripts/spikes/desktop-trees.ts token-weather agent-radar statusline-anywhere
 *   bun scripts/spikes/desktop-trees.ts --variant attach-after-turn agent-radar
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { CommandExitError, type CommandHandle, Sandbox } from 'e2b'
import curation from '@/mods/curation.json'
import { createGitHub } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'
import { buildNetworkOption } from '@/render/e2b-network'
import { E2B_MOD_TEMPLATE_ID, SANDBOX_CLAUDE_CODE_BIN } from '@/render/e2b-template'
import { SANDBOX_PLUGINS_DIR, SANDBOX_WORK_DIR } from '@/render/mods/mod-sandbox'
import { feedScenario, feedStdin } from '@/render/mods/scenario-feed'
import {
  FEED_PLUGIN_DIR,
  SCRIPTED_PROMPT,
  sessionEnv,
  sessionFiles,
  setupCommand,
  shellQuote,
  TERMINAL,
} from '@/render/mods/session'
import { CappedLines } from './capped-lines'

const REPO_ROOT = join(import.meta.dirname, '../..')
const STAGING_ENV = '/Users/nate/Documents/repos/statuslin.es/.env.staging'
const OUT_DIR = join(REPO_ROOT, 'docs/research/desktop-spike')
const TARBALL_PATH = `${SANDBOX_WORK_DIR}/mod.tar.gz`
const PLUGIN_DIR = `${SANDBOX_PLUGINS_DIR}/mod`
const SANDBOX_TIMEOUT_MS = 10 * 60_000
const REQUEST_TIMEOUT_MS = 60_000
const REPLY_WAIT_MS = 30_000
const TURN_WAIT_MS = 60_000
const SETTLE_MS = 3_000
const STDERR_KEEP_CHARS = 16_000
const CLIENT_ID = 'statuslines-spike'
const SITES = ['AbovePrompt', 'SessionMode', 'PromptHint'] as const
/** Desktop's Agent SDK: ProcessTransport.initialize in the Desktop app's index.chunk-CC1Xit3_.js. */
const SDK_FLAGS = ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json']
/** Desktop sets this for its sessions (hIr in index.chunk-CiiI592G.js). */
const DESKTOP_ENV = { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' }

type Variant = 'attach-before-turn' | 'attach-after-turn'
type PropsMode = 'empty' | 'site'

/** The read-only props each site documents (mods/types/claude-code.d.ts), as a client would guess them. */
function siteProps(mode: PropsMode, component: string, instanceId: string): Json {
  if (mode === 'empty') return {}
  const bodyColumns = TERMINAL.cols
  switch (component) {
    case 'AbovePrompt':
      return { hasSurvey: false, isWorking: false, maxRows: TERMINAL.rows / 2, bodyColumns }
    case 'Pane':
      return { title: instanceId, isFocused: false, bodyColumns, placement: 'dock' }
    case 'SessionMode':
      return { modes: [] }
    case 'PromptHint':
      return { isDraft: false, isWorking: false, hint: '? for shortcuts' }
    default:
      return {}
  }
}
type Frame = { atMs: number; dir: 'sent' | 'received' | 'dropped'; message: unknown }
type Json = Record<string, unknown>

function stagingE2bKey(): string {
  const line = readFileSync(STAGING_ENV, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('E2B_API_KEY='))
  const key = line?.slice('E2B_API_KEY='.length).trim().replace(/^"|"$/g, '')
  if (!key) throw new Error('E2B_API_KEY is not in .env.staging')
  return key
}

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

async function run(sandbox: Sandbox, command: string, envs: Record<string, string> = {}) {
  try {
    return await sandbox.commands.run(command, { user: 'user', timeoutMs: 60_000, envs })
  } catch (error) {
    if (error instanceof CommandExitError) return error
    throw error
  }
}

function launchArgs(modelId: string): string[] {
  return [
    ...SDK_FLAGS,
    '--model',
    modelId,
    '--plugin-dir',
    FEED_PLUGIN_DIR,
    '--plugin-dir',
    PLUGIN_DIR,
  ]
}

class Session {
  readonly frames: Frame[] = []
  readonly lines = new CappedLines()
  stderr = ''
  private readonly startedAt = performance.now()
  private nextId = 1
  private readonly pending = new Map<string, (reply: unknown) => void>()
  private resultWaiters: ((result: unknown) => void)[] = []
  handle: CommandHandle | undefined

  constructor(private readonly sandbox: Sandbox) {}

  private at() {
    return Math.round(performance.now() - this.startedAt)
  }

  onStdout = (chunk: string) => {
    for (const line of this.lines.push(chunk)) {
      if (line.kind === 'dropped') {
        this.frames.push({ atMs: this.at(), dir: 'dropped', message: line.reason })
        if (this.lines.overflowed) void this.kill()
        continue
      }
      this.frames.push({ atMs: this.at(), dir: 'received', message: line.value })
      const msg = line.value as Json
      if (msg?.type === 'control_response') {
        const response = msg.response as Json
        const id = String(response?.request_id)
        this.pending.get(id)?.(response)
        this.pending.delete(id)
      }
      if (msg?.type === 'result') {
        for (const waiter of this.resultWaiters) waiter(msg)
        this.resultWaiters = []
      }
    }
  }

  onStderr = (chunk: string) => {
    this.stderr = (this.stderr + chunk).slice(-STDERR_KEEP_CHARS)
  }

  private async send(message: Json) {
    this.frames.push({ atMs: this.at(), dir: 'sent', message })
    if (!this.handle) throw new Error('session not started')
    await this.sandbox.commands.sendStdin(this.handle.pid, `${JSON.stringify(message)}\n`)
  }

  async control(request: Json): Promise<unknown> {
    const request_id = `req_${this.nextId++}`
    const reply = new Promise<unknown>((resolve) => {
      this.pending.set(request_id, resolve)
      setTimeout(() => {
        if (this.pending.delete(request_id)) resolve({ timeout: `${REPLY_WAIT_MS} ms` })
      }, REPLY_WAIT_MS)
    })
    await this.send({ type: 'control_request', request_id, request })
    return reply
  }

  async turn(text: string): Promise<unknown> {
    const done = new Promise<unknown>((resolve) => {
      this.resultWaiters.push(resolve)
      setTimeout(() => resolve({ timeout: `${TURN_WAIT_MS} ms` }), TURN_WAIT_MS)
    })
    await this.send({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    })
    return done
  }

  async kill() {
    await this.handle?.disconnect().catch(() => {})
    await this.handle?.kill().catch(() => false)
  }
}

type CurationEntry = (typeof curation)[number] & {
  inputSteps?: { type: string; text: string; submit?: boolean }[]
}

const SESSION_CONFIG_DIR = '/home/user/session-home/.claude'
const STATUS_LINE_PATH = `${SESSION_CONFIG_DIR}/statusline.sh`

/** A user `statusLine` setting, which statusline-anywhere runs and draws. */
function statusLineFiles(script: string) {
  return [
    { path: STATUS_LINE_PATH, data: script },
    {
      path: `${SESSION_CONFIG_DIR}/settings.json`,
      data: JSON.stringify({
        statusLine: { type: 'command', command: `bash ${STATUS_LINE_PATH}` },
      }),
    },
  ]
}

function systemFrames(frames: Frame[], subtype: (s: string) => boolean): Frame[] {
  return frames.filter((f) => {
    const msg = f.message as Json
    return (
      f.dir === 'received' &&
      msg?.type === 'system' &&
      typeof msg.subtype === 'string' &&
      subtype(msg.subtype)
    )
  })
}

/** Pane ids from the `ui_panes` reply and every pushed `ui_panes` message. */
function paneIdsFrom(frames: Frame[], panesReply: unknown): Set<string> {
  const ids = new Set<string>()
  const collect = (value: unknown) => {
    const panes = (value as Json | undefined)?.panes
    if (!Array.isArray(panes)) return
    for (const pane of panes) {
      const id = (pane as Json)?.id
      if (typeof id === 'string' && id.length <= 256) ids.add(id)
    }
  }
  collect((panesReply as Json | undefined)?.response)
  for (const frame of systemFrames(frames, (s) => s === 'ui_panes')) collect(frame.message)
  return ids
}

async function renderSites(session: Session, propsMode: PropsMode, paneIds: Set<string>) {
  const viewport = { columns: TERMINAL.cols, rows: TERMINAL.rows, isFullscreen: false }
  const render = (component: string, instanceId: string) =>
    session.control({
      subtype: 'ui_render',
      surface: 'desktop',
      client_id: CLIENT_ID,
      component,
      instance_id: instanceId,
      props: siteProps(propsMode, component, instanceId),
      viewport,
    })
  const renders: Json = {}
  for (const component of SITES) renders[component] = await render(component, component)
  for (const id of paneIds) renders[`Pane:${id}`] = await render('Pane', id)
  return renders
}

/** Unpacks the mod and writes the same session home, feed and canned model as a recording. */
async function prepareSession(
  sandbox: Sandbox,
  entry: CurationEntry,
  tarball: Uint8Array,
  statusLineScript: string | undefined,
): Promise<string> {
  const scenario = feedScenario()
  await sandbox.files.write(
    [
      {
        path: TARBALL_PATH,
        data: tarball.buffer.slice(
          tarball.byteOffset,
          tarball.byteOffset + tarball.byteLength,
        ) as ArrayBuffer,
      },
    ],
    { user: 'user' },
  )
  const unpacked = await run(sandbox, unpackCommand(entry.path))
  if (unpacked.exitCode !== 0) throw new Error(`unpack failed: ${unpacked.stderr.trim()}`)
  const versionOut = await run(sandbox, `${SANDBOX_CLAUDE_CODE_BIN} --version`)
  const claudeCodeVersion = versionOut.stdout.trim().split(' ')[0] ?? 'unknown'
  await sandbox.files.write(
    sessionFiles(scenario, { target: entry.pluginName, nowMs: Date.now(), claudeCodeVersion }),
    { user: 'user' },
  )
  if (statusLineScript !== undefined) {
    await sandbox.files.write(statusLineFiles(statusLineScript), { user: 'user' })
  }
  const setup = await run(sandbox, setupCommand(scenario))
  if (setup.exitCode !== 0) throw new Error(`setup failed: ${setup.stderr.trim()}`)
  return claudeCodeVersion
}

async function spikeMod(
  entry: CurationEntry,
  variant: Variant,
  apiKey: string,
  statusLineScript: string | undefined,
  propsMode: PropsMode,
) {
  const scenario = feedScenario()
  const createdAt = performance.now()
  const tarball = await createGitHub().tarball(entry.repoUrl, entry.commitSha)
  const tarballMs = Math.round(performance.now() - createdAt)
  const sandbox = await Sandbox.create(E2B_MOD_TEMPLATE_ID, {
    apiKey,
    ...buildNetworkOption([]),
    timeoutMs: SANDBOX_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    secure: true,
  })
  const session = new Session(sandbox)
  const timings: Record<string, number> = {}
  const mark = (name: string) => {
    timings[name] = Math.round(performance.now() - createdAt)
  }
  const summary: Json = {}
  timings.tarball = tarballMs
  try {
    mark('sandbox')
    summary.claudeCodeVersion = await prepareSession(sandbox, entry, tarball, statusLineScript)
    mark('setup')

    const args = launchArgs(feedStdin(scenario).model.id)
    const command = `exec ${SANDBOX_CLAUDE_CODE_BIN} ${args.map(shellQuote).join(' ')}`
    const envs = { ...sessionEnv(scenario), ...DESKTOP_ENV }
    summary.command = command
    summary.envAdded = DESKTOP_ENV
    session.handle = await sandbox.commands.run(command, {
      background: true,
      stdin: true,
      user: 'user',
      cwd: feedStdin(scenario).workspace.current_dir,
      envs,
      timeoutMs: SANDBOX_TIMEOUT_MS,
      onStdout: session.onStdout,
      onStderr: session.onStderr,
    })
    mark('spawned')

    summary.initialize = await session.control({ subtype: 'initialize' })
    mark('initialized')

    const attach = () =>
      session.control({
        subtype: 'ui_attach',
        surface: 'desktop',
        client_id: CLIENT_ID,
        viewport: { columns: TERMINAL.cols, rows: TERMINAL.rows, isFullscreen: false },
      })
    if (variant === 'attach-before-turn') summary.attach = await attach()
    mark('attached')

    const turns: unknown[] = [await session.turn(SCRIPTED_PROMPT.text)]
    for (const step of entry.inputSteps ?? []) {
      if (step.submit === false) continue
      turns.push(await session.turn(step.text))
    }
    summary.turnResults = turns
    mark('turns')
    if (variant === 'attach-after-turn') summary.attach = await attach()
    await new Promise((r) => setTimeout(r, SETTLE_MS))

    summary.panesRequest = await session.control({ subtype: 'ui_panes' })
    summary.renders = await renderSites(
      session,
      propsMode,
      paneIdsFrom(session.frames, summary.panesRequest),
    )
    mark('rendered')
    await new Promise((r) => setTimeout(r, SETTLE_MS))
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error)
  } finally {
    await session.kill()
    await sandbox.kill().catch(() => {})
    mark('killed')
  }

  summary.timingsMs = timings
  summary.stdoutOverflowed = session.lines.overflowed
  summary.systemUi = systemFrames(session.frames, (s) => s.startsWith('ui_'))
  const [init] = systemFrames(session.frames, (s) => s === 'init')
  summary.capability = {
    inInitializeReply: JSON.stringify(summary.initialize ?? null).includes('ui_surface_v1'),
    inSystemInit: init ? JSON.stringify(init.message).includes('ui_surface_v1') : 'no init message',
  }
  return {
    slug: entry.pluginName,
    variant,
    summary,
    frames: session.frames,
    stderr: session.stderr,
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      variant: { type: 'string', default: 'attach-before-turn' },
      'status-line': { type: 'string' },
      props: { type: 'string', default: 'empty' },
    },
    allowPositionals: true,
    strict: true,
  })
  const variant = values.variant as Variant
  const statusLineScript =
    values['status-line'] === undefined ? undefined : readFileSync(values['status-line'], 'utf8')
  const propsMode = values.props as PropsMode
  const tag = [variant, statusLineScript === undefined ? [] : 'status-line', `props-${propsMode}`]
    .flat()
    .join('.')
  const apiKey = stagingE2bKey()
  mkdirSync(OUT_DIR, { recursive: true })
  const entries = positionals.map((slug) => {
    const entry = (curation as CurationEntry[]).find((e) => e.pluginName === slug)
    if (!entry) throw new Error(`no curated mod "${slug}"`)
    return entry
  })
  const results = await Promise.all(
    entries.map((entry) => spikeMod(entry, variant, apiKey, statusLineScript, propsMode)),
  )
  for (const result of results) {
    const file = join(OUT_DIR, `${result.slug}.${tag}.json`)
    writeFileSync(file, JSON.stringify(result, null, 2))
    const s = result.summary
    console.log(
      terminalLine(
        `${result.slug}: capability=${JSON.stringify(s.capability)} error=${s.error ?? 'none'} timings=${JSON.stringify(s.timingsMs)} -> ${file}`,
      ),
    )
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(terminalLine(`[desktop-trees] ${error instanceof Error ? error.message : error}`))
    process.exit(1)
  },
)
