// biome-ignore-all lint/style/useNamingConvention: env var names and Claude Code config keys are external contracts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InputStep } from '@/mods/curation'
import {
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_REPLAY_DIR,
} from '../e2b-template'
import type { Scenario } from '../types'
import { cannedReply, feedFile, feedStdin } from './scenario-feed'

export const TERMINAL = { cols: 100, rows: 30 }

const HOME = '/home/user/session-home'
const CONFIG_DIR = `${HOME}/.claude`
const WORK_DIR = '/home/user/.statuslines'
/** The feed plugin reads this path literally (sandbox/scenario-feed/hooks/register.ts). */
export const FEED_FILE = `${WORK_DIR}/feed.json`
export const REPLY_FILE = `${WORK_DIR}/reply.json`
export const FEED_PLUGIN_DIR = '/home/user/plugins/scenario-feed'
const MODEL_PORT = 8787
const FAKE_API_KEY = `sk-ant-api03-${'statuslinespreview'.padEnd(80, '0')}-AA`
const FEED_PLUGIN_ASSETS = ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.ts']
const FEED_PLUGIN_SRC = join(import.meta.dirname, 'sandbox/scenario-feed')
const RECORDING_FILE = `${WORK_DIR}/recording.bin`
const REPLAY_SCRIPT_FILE = `${WORK_DIR}/replay.cjs`
const REPLAY_SCRIPT_SRC = join(import.meta.dirname, 'sandbox/replay.cjs')

/** Typed before the input steps, so every recording has a finished turn. */
export const SCRIPTED_PROMPT: InputStep = { type: 'text', text: 'hello' }

/** Opus 4.8 reports a 1M window unless 1M context is off, which leaves it at 200k (measured on 2.1.296). */
function contextWindowEnv(windowSize: number): Record<string, string> {
  if (windowSize === 1_000_000) return {}
  if (windowSize === 200_000) return { CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' }
  throw new Error(`Claude Code cannot be set to a ${windowSize}-token context window`)
}

export function sessionEnv(scenario: Scenario): Record<string, string> {
  return {
    HOME,
    CLAUDE_CONFIG_DIR: CONFIG_DIR,
    ANTHROPIC_API_KEY: FAKE_API_KEY,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MODEL_PORT}`,
    DISABLE_TELEMETRY: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'C.UTF-8',
    ...contextWindowEnv(feedStdin(scenario).context_window.context_window_size),
  }
}

/** Onboarding done, the workspace trusted and the key approved, so the session opens at the prompt. */
function claudeJson(scenario: Scenario, claudeCodeVersion: string): string {
  return JSON.stringify({
    hasCompletedOnboarding: true,
    lastOnboardingVersion: claudeCodeVersion,
    lastReleaseNotesSeen: claudeCodeVersion,
    numStartups: 5,
    theme: 'dark',
    autoUpdates: false,
    customApiKeyResponses: { approved: [FAKE_API_KEY.slice(-20)], rejected: [] },
    projects: {
      [feedStdin(scenario).workspace.current_dir]: {
        hasTrustDialogAccepted: true,
        hasCompletedProjectOnboarding: true,
        projectOnboardingSeenCount: 5,
        allowedTools: [],
      },
    },
  })
}

export interface SessionSeed {
  /** The mod under render by its plugin.json name; null for the baseline. */
  target: string | null
  nowMs: number
  claudeCodeVersion: string
}

export function sessionFiles(
  scenario: Scenario,
  { target, nowMs, claudeCodeVersion }: SessionSeed,
): { path: string; data: string }[] {
  return [
    { path: `${CONFIG_DIR}/.claude.json`, data: claudeJson(scenario, claudeCodeVersion) },
    { path: FEED_FILE, data: JSON.stringify(feedFile(scenario, target, nowMs)) },
    { path: REPLY_FILE, data: JSON.stringify(cannedReply(scenario)) },
    ...FEED_PLUGIN_ASSETS.map((asset) => ({
      path: `${FEED_PLUGIN_DIR}/${asset}`,
      data: readFileSync(join(FEED_PLUGIN_SRC, asset), 'utf8'),
    })),
  ]
}

/** The workspace repo, then the canned model on loopback, waiting until it answers. */
export function setupCommand(scenario: Scenario): string {
  const { workspace } = feedStdin(scenario)
  const { host, owner, name } = workspace.repo
  const branch = scenario.git?.branch ?? 'main'
  const modelUrl = `http://127.0.0.1:${MODEL_PORT}/`
  return [
    `mkdir -p ${workspace.current_dir}`,
    `cd ${workspace.current_dir}`,
    `git init -q -b ${branch}`,
    `git remote add origin https://${host}/${owner}/${name}.git`,
    'echo seed > README.md',
    'git add -A',
    'git -c user.email=preview@statuslin.es -c user.name=preview commit -qm seed',
    `(nohup python3 ${SANDBOX_CANNED_MODEL_SERVER_DEST} --listen 127.0.0.1 --port ${MODEL_PORT} --canned-reply ${REPLY_FILE} >${WORK_DIR}/model.log 2>&1 &)`,
    `for i in $(seq 1 50); do curl -s -o /dev/null ${modelUrl} && exit 0; sleep 0.1; done; cat ${WORK_DIR}/model.log >&2; exit 1`,
  ].join(' && ')
}

/** The feed's `--plugin-dir` comes first, so its hooks sit above the mod's. */
export function launchCommand(scenario: Scenario, modPluginDir: string | null): string {
  const pluginDirs = [FEED_PLUGIN_DIR, ...(modPluginDir ? [modPluginDir] : [])]
  const flags = pluginDirs.map((dir) => `--plugin-dir ${dir}`).join(' ')
  return `exec ${SANDBOX_CLAUDE_CODE_BIN} --model ${feedStdin(scenario).model.id} ${flags}`
}

export function keystrokes(step: InputStep): string[] {
  return step.submit === false ? [step.text] : [step.text, '\r']
}

export function replayFiles(recording: Uint8Array): { path: string; data: string | Uint8Array }[] {
  return [
    { path: RECORDING_FILE, data: recording },
    { path: REPLAY_SCRIPT_FILE, data: readFileSync(REPLAY_SCRIPT_SRC, 'utf8') },
  ]
}

export const REPLAY = {
  command: `node ${REPLAY_SCRIPT_FILE} ${RECORDING_FILE} ${TERMINAL.cols} ${TERMINAL.rows}`,
  envs: { NODE_PATH: `${SANDBOX_REPLAY_DIR}/node_modules` },
}
