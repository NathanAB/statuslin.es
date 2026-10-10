import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_CLAUDE_SETTINGS_DEST,
} from '@/render/e2b-template'
import { feedFile, feedScenario } from '@/render/mods/scenario-feed'
import {
  FEED_FILE,
  FEED_PLUGIN_DIR,
  keystrokes,
  launchCommand,
  REPLY_FILE,
  sessionEnv,
  sessionFiles,
  setupCommand,
  shellQuote,
} from '@/render/mods/session'
import { usage } from '@/render/scenario-helpers'
import type { Scenario } from '@/render/types'

const NOW_MS = Date.UTC(2026, 9, 9, 12, 0, 0)
const MOD_DIR = '/home/user/plugins/mod'
const HOSTILE = [
  "it's",
  'two words',
  '"double"',
  '$(echo injected)',
  '`echo injected`',
  'a; echo injected',
  "'; echo injected; '",
]

/** The scenario with every value the session commands interpolate replaced by `value`. */
function scenarioWith(value: string): Scenario {
  const scenario = feedScenario()
  const stdin = scenario.stdin as Record<string, Record<string, unknown>>
  return {
    ...scenario,
    git: { branch: value, dirty: false },
    stdin: {
      ...stdin,
      model: { ...stdin.model, id: value },
      workspace: {
        ...stdin.workspace,
        current_dir: value,
        repo: { host: value, owner: value, name: value },
      },
    },
  } as Scenario
}

function fileAt(path: string, target: string | null = 'token-weather'): string {
  const seed = { target, nowMs: NOW_MS, claudeCodeVersion: '2.1.296' }
  const file = sessionFiles(feedScenario(), seed).find((f) => f.path === path)
  if (!file) throw new Error(`no seed file at ${path}`)
  return file.data
}

describe('sessionEnv', () => {
  const env = sessionEnv(feedScenario())

  it('points Claude Code at the canned model with a fake key, and turns off its traffic', () => {
    expect(env.ANTHROPIC_API_KEY).toMatch(/^sk-ant-api03-/)
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8787')
    expect(env.DISABLE_TELEMETRY).toBe('1')
    expect(env.DISABLE_AUTOUPDATER).toBe('1')
    expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1')
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
  })

  it('uses a throwaway home and config dir, apart from the status line settings', () => {
    expect(env.HOME).not.toBe('/home/user')
    expect(env.CLAUDE_CONFIG_DIR?.startsWith(`${env.HOME}/`)).toBe(true)
    expect(SANDBOX_CLAUDE_SETTINGS_DEST.startsWith(`${env.CLAUDE_CONFIG_DIR}/`)).toBe(false)
  })

  it('turns 1M context off, so Claude Code reports the 200k window clean-main describes', () => {
    expect(env.CLAUDE_CODE_DISABLE_1M_CONTEXT).toBe('1')
  })

  it('leaves 1M context on for a 1M scenario', () => {
    const scenario = feedScenario()
    const wide = { ...scenario, stdin: { ...scenario.stdin, context_window: usage(4, 1_000_000) } }

    expect(sessionEnv(wide).CLAUDE_CODE_DISABLE_1M_CONTEXT).toBeUndefined()
  })

  it('refuses a window Claude Code cannot be set to', () => {
    const scenario = feedScenario()
    const odd = { ...scenario, stdin: { ...scenario.stdin, context_window: usage(4, 500_000) } }

    expect(() => sessionEnv(odd)).toThrow(/500000/)
  })
})

describe('sessionFiles', () => {
  const env = sessionEnv(feedScenario())

  it('seeds .claude.json so no onboarding, trust or API-key screen appears', () => {
    const seed = JSON.parse(fileAt(`${env.CLAUDE_CONFIG_DIR}/.claude.json`))

    expect(seed.hasCompletedOnboarding).toBe(true)
    expect(seed.lastOnboardingVersion).toBe('2.1.296')
    expect(seed.projects['/home/user/app']).toMatchObject({
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
    })
    expect(seed.customApiKeyResponses.approved).toEqual([env.ANTHROPIC_API_KEY?.slice(-20)])
  })

  it('writes the feed answers for the mod under render, and none for the baseline', () => {
    expect(JSON.parse(fileAt(FEED_FILE))).toEqual(feedFile(feedScenario(), 'token-weather', NOW_MS))
    expect(JSON.parse(fileAt(FEED_FILE, null)).target).toBeNull()
  })

  it('writes the canned reply with the scenario usage', () => {
    expect(JSON.parse(fileAt(REPLY_FILE)).usage.input_tokens).toBe(37_000)
  })

  it('writes the scenario feed plugin', () => {
    const manifest = JSON.parse(fileAt(`${FEED_PLUGIN_DIR}/.claude-plugin/plugin.json`))

    expect(manifest.name).toBe('scenario-feed')
    expect(fileAt(`${FEED_PLUGIN_DIR}/hooks/register.ts`)).toContain(FEED_FILE)
  })
})

describe('scenario feed plugin', () => {
  const register = readFileSync(
    join(import.meta.dirname, '../../../src/render/mods/sandbox/scenario-feed/hooks/register.ts'),
    'utf8',
  )

  it('hooks every answered event by its literal name, and never by wildcard', () => {
    const { answers } = feedFile(feedScenario(), 'token-weather', NOW_MS)

    for (const event of Object.keys(answers)) expect(register).toContain(`on('${event}',`)
    expect(register).not.toContain(`on('*'`)
  })
})

describe('shellQuote', () => {
  it.each(HOSTILE)('passes %s to a shell as one literal argument', (value) => {
    const echoed = execFileSync('/bin/sh', ['-c', `printf '%s\n' ${shellQuote(value)}`], {
      encoding: 'utf8',
    })

    expect(echoed).toBe(`${value}\n`)
  })
})

describe('setupCommand', () => {
  const command = setupCommand(feedScenario())

  it('makes the working directory a git repo on main with an acme/app origin', () => {
    expect(command).toContain("mkdir -p '/home/user/app'")
    expect(command).toContain("git init -q -b 'main'")
    expect(command).toContain("git remote add origin 'https://github.com/acme/app.git'")
  })

  it.each(HOSTILE)('quotes the scenario value %s wherever it goes', (value) => {
    const hostile = setupCommand(scenarioWith(value))

    expect(hostile).toContain(`mkdir -p ${shellQuote(value)}`)
    expect(hostile).toContain(`cd ${shellQuote(value)}`)
    expect(hostile).toContain(`git init -q -b ${shellQuote(value)}`)
    expect(hostile).toContain(
      `git remote add origin ${shellQuote(`https://${value}/${value}/${value}.git`)}`,
    )
  })

  it('starts the canned model on loopback with the reply file', () => {
    expect(command).toContain(
      `python3 ${SANDBOX_CANNED_MODEL_SERVER_DEST} --listen 127.0.0.1 --port 8787 --canned-reply ${REPLY_FILE}`,
    )
  })
})

describe('launchCommand', () => {
  it('runs Claude Code by its absolute path on the scenario model with only the feed', () => {
    expect(launchCommand(feedScenario(), null)).toBe(
      `exec ${SANDBOX_CLAUDE_CODE_BIN} --model 'claude-opus-4-8' --plugin-dir '${FEED_PLUGIN_DIR}'`,
    )
  })

  it('loads the mod after the feed, so the feed sits above it', () => {
    expect(launchCommand(feedScenario(), MOD_DIR)).toBe(
      `exec ${SANDBOX_CLAUDE_CODE_BIN} --model 'claude-opus-4-8' --plugin-dir '${FEED_PLUGIN_DIR}' --plugin-dir '${MOD_DIR}'`,
    )
  })

  it.each(HOSTILE)('quotes the scenario model id %s', (value) => {
    expect(launchCommand(scenarioWith(value), null)).toContain(`--model ${shellQuote(value)} `)
  })
})

describe('keystrokes', () => {
  it('types the text then presses Enter', () => {
    expect(keystrokes({ type: 'text', text: '/radar' })).toEqual(['/radar', '\r'])
    expect(keystrokes({ type: 'text', text: '/radar', submit: true })).toEqual(['/radar', '\r'])
  })

  it('leaves the text unsent when submit is false', () => {
    expect(keystrokes({ type: 'text', text: 'look at [Image #1]', submit: false })).toEqual([
      'look at [Image #1]',
    ])
  })
})
