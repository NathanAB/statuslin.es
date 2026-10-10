// biome-ignore-all lint/style/useNamingConvention: env var names and settings keys are external contracts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SANDBOX_DESKTOP_BOOT } from '../../e2b-template'
import type { Scenario } from '../../types'
import { cannedReply, feedStdin } from '../scenario-feed'
import {
  FEED_PLUGIN_DIR,
  REPLY_FILE,
  SCRIPTED_PROMPT,
  type SessionSeed,
  sessionEnv,
  sessionFiles,
  shellQuote,
} from '../session'
import { SCALE, WINDOW } from './screen'

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

/**
 * What must exist before Desktop boots: its dark theme, and the canned reply the model server
 * answers with, since Desktop checks the gateway while it starts.
 */
export function desktopBootFiles(scenario: Scenario): { path: string; data: string }[] {
  return [{ path: REPLY_FILE, data: JSON.stringify(cannedReply(scenario)) }, DARK_THEME]
}

/**
 * The terminal session's files, plus the committed sample status line (so a mod that shows the
 * user's status line has one to draw) and Desktop's dark theme. Written once the engine's version
 * is known, before the session starts the engine.
 */
export function desktopSessionFiles(
  scenario: Scenario,
  seed: SessionSeed,
): { path: string; data: string }[] {
  const statusLine = `${configDir(scenario)}/statusline.sh`
  return [
    ...sessionFiles(scenario, seed),
    { path: statusLine, data: readFileSync(STATUS_LINE_SRC, 'utf8') },
    {
      path: `${configDir(scenario)}/settings.json`,
      data: JSON.stringify({ statusLine: { type: 'command', command: `bash ${statusLine}` } }),
    },
    DARK_THEME,
  ]
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
export const ENGINE_VERSION_COMMAND = `ls ${DESKTOP_DATA_DIR}/claude-code`

const VERSION = /^\d+\.\d+\.\d+$/

export function parseVersion(stdout: string, what: string): string {
  const version = stdout.trim()
  if (!VERSION.test(version)) throw new Error(`unreadable ${what} version`)
  return version
}
