// biome-ignore-all lint/style/useNamingConvention: env var names and settings keys are external contracts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TextStep } from '@/mods/curation'
import { externalNetworkHosts, shouldMockAnthropicUsage } from '../../anthropic-usage-mock'
import {
  anthropicUsageMockFiles,
  anthropicUsageSetupScript,
  withAnthropicUsageEnv,
} from '../../anthropic-usage-sandbox'
import { SANDBOX_DESKTOP_BOOT, SANDBOX_DESKTOP_ENGINE_VERSION } from '../../e2b-template'
import { RUN_CMD, scriptExtension } from '../../script-extension'
import type { Scenario } from '../../types'
import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import { cannedReply, feedStdin } from '../scenario-feed'
import {
  FEED_PLUGIN_DIR,
  SCRIPTED_PROMPT,
  type SessionSeed,
  sessionEnv,
  sessionFiles,
  shellQuote,
} from '../session'
import { SCALE, WINDOW } from './screen'
import type { StatusLineScript } from './types'

/** The virtual display Desktop runs on, the size of its window. */
export const DISPLAY = ':99'
const DEVICE_WIDTH = WINDOW.width * SCALE
const DEVICE_HEIGHT = WINDOW.height * SCALE
/** Desktop's own data in gateway mode, under the sandbox user's real home. */
const DESKTOP_DATA_DIR = '/home/user/.config/Claude-3p'
const STATUS_LINE_SRC = join(import.meta.dirname, 'sandbox/statusline.sh')

/** Electron's own sandbox cannot start under the mods hardening (no setuid, no user namespaces). */
const DESKTOP_ARGS = [
  '--password-store=gnome-libsecret',
  '--no-sandbox',
  `--force-device-scale-factor=${SCALE}`,
]

const configDir = (scenario: Scenario) => sessionEnv(scenario).CLAUDE_CONFIG_DIR ?? ''

/**
 * What Desktop starts with. Its engine inherits the session config and the scenario feed; Desktop
 * keeps the real home for its own data and reaches the canned model through its managed settings.
 */
export function desktopEnv(
  scenario: Scenario,
  modPluginDir: string | null,
): Record<string, string> {
  const {
    HOME: _home,
    ANTHROPIC_API_KEY: _apiKey,
    ANTHROPIC_BASE_URL: _baseUrl,
    TERM: _term,
    COLORTERM: _colorTerm,
    ...engine
  } = sessionEnv(scenario)
  return {
    ...engine,
    DISPLAY,
    SCREEN: `${DEVICE_WIDTH}x${DEVICE_HEIGHT}x24`,
    CLAUDE_CODE_PLUGIN_DIRS: [FEED_PLUGIN_DIR, ...(modPluginDir ? [modPluginDir] : [])].join(':'),
    TZ: 'UTC',
  }
}

export function bootCommand(scenario: Scenario, modPluginDir: string | null): string {
  const env = Object.entries(desktopEnv(scenario, modPluginDir))
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(' ')
  return `env ${env} ${SANDBOX_DESKTOP_BOOT} ${DESKTOP_ARGS.join(' ')}`
}

/** Opens a Code session on the workspace with the scripted prompt already typed. */
export function deepLink(scenario: Scenario): string {
  const folder = encodeURIComponent(feedStdin(scenario).workspace.current_dir)
  return `claude://code/new?folder=${folder}&q=${encodeURIComponent(SCRIPTED_PROMPT.text)}`
}

/** A second Desktop process hands the link to the running one and exits. */
export const deepLinkCommand = (scenario: Scenario) =>
  `timeout 15 claude-desktop ${DESKTOP_ARGS.join(' ')} ${shellQuote(deepLink(scenario))} >/dev/null 2>&1`

const DARK_THEME = {
  path: `${DESKTOP_DATA_DIR}/config.json`,
  data: JSON.stringify({ userThemeMode: 'dark' }),
}

const sampleStatusLine = (): StatusLineScript => ({
  source: readFileSync(STATUS_LINE_SRC, 'utf8'),
  interpreter: 'bash',
})

const ANTHROPIC_DOMAINS = ['anthropic.com', 'claude.ai', 'claude.com']

/** Desktop and its engine hold a fake key, so a session never reaches Anthropic for real. */
export const isAnthropicHost = (host: string) =>
  ANTHROPIC_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))

const mocksUsage = (statusLine: StatusLineScript | undefined) =>
  statusLine !== undefined &&
  shouldMockAnthropicUsage({
    readsClaudeToken: statusLine.readsClaudeToken === true,
    networkHosts: [...(statusLine.networkHosts ?? [])],
  })

const reachableHosts = (statusLine: StatusLineScript | undefined) =>
  externalNetworkHosts([...(statusLine?.networkHosts ?? [])], mocksUsage(statusLine))

/** An Anthropic host the status line would need for real, which no Desktop session can give it. */
export const realAnthropicHost = (statusLine: StatusLineScript | undefined) =>
  reachableHosts(statusLine).find(isAnthropicHost)

/**
 * The hosts a session may reach: the status line's approved ones, less the usage host the mock
 * serves on loopback, and the root command that starts the mock. Throws on an Anthropic host.
 */
export interface SessionNetwork {
  networkHosts: string[]
  rootCommand: string | null
}

export function desktopSessionNetwork(statusLine: StatusLineScript | undefined): SessionNetwork {
  const anthropic = realAnthropicHost(statusLine)
  if (anthropic) throw new Error(`Desktop never reaches a real Anthropic host (${anthropic})`)
  return {
    networkHosts: reachableHosts(statusLine),
    rootCommand: mocksUsage(statusLine) ? anthropicUsageSetupScript() : null,
  }
}

/**
 * Only the status line command gets the mock's token: in Desktop's env the engine would leave the
 * gateway for OAuth. Unsetting the session's config dir sends the script to the real home's
 * credentials, as on a user's machine.
 */
const MOCK_ENV_PREFIX = `env -u CLAUDE_CONFIG_DIR ${Object.entries(withAnthropicUsageEnv({}))
  .map(([key, value]) => `${key}=${value}`)
  .join(' ')} `

/**
 * The terminal session's files (the canned reply among them, which Desktop's gateway check needs
 * while it boots), plus a status line, so a mod that shows the user's status line has one to draw:
 * the given one, else the committed sample, set in the terminal session's settings.json (beside a
 * busy session's permission rules). Then Desktop's dark theme. Uploaded before Desktop
 * starts: once a mod's code may be running, nothing more is uploaded into its sandbox.
 */
export function desktopSessionFiles(
  scenario: Scenario,
  seed: SessionSeed,
  statusLine: StatusLineScript = sampleStatusLine(),
): { path: string; data: string }[] {
  const { source, interpreter } = statusLine
  const script = `${configDir(scenario)}/statusline.${scriptExtension(interpreter, source)}`
  const mock = mocksUsage(statusLine)
  // statusline-anywhere gives the command a socket for stdin on Linux, which a script reading
  // /dev/stdin cannot open; through a pipe it reads the JSON as it does on a Mac.
  const command = `cat | ${mock ? MOCK_ENV_PREFIX : ''}${RUN_CMD[interpreter]} ${script}`
  return [
    ...sessionFiles(scenario, seed, { statusLine: { type: 'command', command } }),
    ...(mock ? anthropicUsageMockFiles(scenario, seed.nowMs) : []),
    { path: script, data: source },
    DARK_THEME,
  ]
}

/** Where input step `index`'s text is staged; the recorder types it from there. */
export const stepTextPath = (index: number) => `${SANDBOX_WORK_DIR}/step-${index}.txt`

export function stepFiles(steps: readonly TextStep[]): { path: string; data: string }[] {
  return steps.map((step, i) => ({ path: stepTextPath(i), data: step.text }))
}

const transcripts = (scenario: Scenario) => `${configDir(scenario)}/projects/*/*.jsonl`

/** The session transcript grows by a line when Desktop sends a prompt. */
export const transcriptLinesCommand = (scenario: Scenario) =>
  `cat ${transcripts(scenario)} 2>/dev/null | wc -l`

/** Succeeds once the canned model's reply to the scripted prompt is in the transcript. */
export const repliedCommand = (scenario: Scenario) =>
  `grep -qsF ${shellQuote(cannedReply(scenario).text)} ${transcripts(scenario)}`

/**
 * Moves Desktop's window over the whole display and succeeds only once it is there. Desktop can
 * replace its first window while it starts, so this is polled rather than run once.
 */
export const FIT_WINDOW_COMMAND = [
  `w=$(xdotool search --onlyvisible --name '^Claude$' | head -n 1)`,
  `xdotool windowmove "$w" 0 0 windowsize "$w" ${DEVICE_WIDTH} ${DEVICE_HEIGHT}`,
  'sleep 0.2',
  `test "$(xdotool getwindowgeometry --shell "$w" | grep -E '^(X|Y|WIDTH|HEIGHT)=' | tr '\\n' ' ')" = "X=0 Y=0 WIDTH=${DEVICE_WIDTH} HEIGHT=${DEVICE_HEIGHT} "`,
].join(' && ')

export const DESKTOP_VERSION_COMMAND = `dpkg-query -W -f='\${Version}' claude-desktop`
/** Desktop installs its preseeded engine under a folder named for the engine's version. */
export const ENGINE_INSTALLED_COMMAND = `ls ${DESKTOP_DATA_DIR}/claude-code/*/*/.verified`
export const ENGINE_VERSION_COMMAND = `cat ${SANDBOX_DESKTOP_ENGINE_VERSION}`

const VERSION = /^\d+\.\d+\.\d+$/

export function parseVersion(stdout: string, what: string): string {
  const version = stdout.trim()
  if (!VERSION.test(version)) throw new Error(`unreadable ${what} version`)
  return version
}
