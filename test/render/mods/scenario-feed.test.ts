import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BUSY_WORKSPACE_FILES,
  busySettings,
  cannedReply,
  feedFile,
  feedScenario,
} from '@/render/mods/scenario-feed'
import { hm, usage, win } from '@/render/scenario-helpers'
import { SCENARIO_BY_KEY } from '@/render/scenarios'
import type { Scenario } from '@/render/types'

const NOW_MS = Date.UTC(2026, 9, 9, 12, 0, 0)

function withStdin(overrides: Record<string, unknown>): Scenario {
  const scenario = feedScenario()
  return { ...scenario, stdin: { ...scenario.stdin, ...overrides } }
}

describe('feedScenario', () => {
  it('is clean-main', () => {
    expect(feedScenario()).toBe(SCENARIO_BY_KEY.get('clean-main'))
  })
})

describe('feedFile', () => {
  it('answers the session calls from the scenario, for the mod under render', () => {
    const { target, answers } = feedFile(feedScenario(), 'token-weather', NOW_MS)

    expect(target).toBe('token-weather')
    expect(answers['session.usage']).toEqual({
      startedAt: NOW_MS - 612_000,
      context: { tokens: 44_000, window: 200_000, percent: 22 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 26, resetsAt: '2026-10-09T14:07:00.000Z' },
        { kind: 'seven_day', percentUsed: 7, resetsAt: '2026-10-11T13:00:00.000Z' },
      ],
      cost: { usd: 0.41 },
    })
    expect(answers['session.model']).toBe('Opus 4.8')
    expect(answers['session.cwd']).toBe('/home/user/app')
    expect(answers['session.root']).toBe('/home/user/app')
    expect(answers['session.id']).toBe('b8e1c0d2-4a6f-4e2a-9c1b-3f5d7a9e2c10')
    expect(answers['session.repo']).toEqual({
      root: '/home/user/app',
      remote: 'https://github.com/acme/app.git',
      internal: false,
      name: null,
    })
    expect(answers['session.version']).toEqual({ version: '2.1.155', base: '2.1.155' })
  })

  it('follows the scenario when it changes', () => {
    const scenario = withStdin({
      context_window: usage(48, 1_000_000),
      rate_limits: { five_hour: win(90, hm(0, 30)), seven_day: win(50, hm(1, 0)) },
      cost: { total_cost_usd: 2.5, total_duration_ms: 1_000 },
      model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' },
    })

    const { answers } = feedFile(scenario, 'context-bar', NOW_MS)

    expect(answers['session.usage']).toEqual({
      startedAt: NOW_MS - 1_000,
      context: { tokens: 480_000, window: 1_000_000, percent: 48 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 90, resetsAt: '2026-10-09T12:30:00.000Z' },
        { kind: 'seven_day', percentUsed: 50, resetsAt: '2026-10-09T13:00:00.000Z' },
      ],
      cost: { usd: 2.5 },
    })
    expect(answers['session.model']).toBe('Sonnet 4.6')
  })

  it('names no target for the baseline, so no plugin is answered', () => {
    expect(feedFile(feedScenario(), null, NOW_MS).target).toBeNull()
  })

  it("answers the mod's own model calls with one plain reply that costs nothing", () => {
    const { answers } = feedFile(feedScenario(), 'ctx-handoff', NOW_MS)
    const reply = {
      isAnswered: true,
      text: 'Fixed the bug in src/sum.js, and all 3 tests pass now.',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }

    expect(answers['model.complete']).toEqual(reply)
    expect(answers['model.fork']).toEqual(reply)
  })

  it('lists two subagents at work', () => {
    const { answers } = feedFile(feedScenario(), 'flightdeck', NOW_MS)

    expect(answers['agent.list']).toEqual([
      {
        id: 'a1f3c9e0',
        description: 'Run the test suite',
        type: 'general-purpose',
        status: 'running',
      },
      { id: 'b72d4e18', description: 'Review the sum fix', type: 'Explore', status: 'running' },
    ])
  })

  it('plays one fixed busy session in the workspace: a failing test, a fix, a pass, a denied rm -rf', () => {
    expect(feedFile(feedScenario(), null, NOW_MS).busy).toEqual([
      { tool: 'Bash', command: 'npm test', description: 'Run the tests' },
      { tool: 'Read', file_path: '/home/user/app/src/sum.js' },
      {
        tool: 'Edit',
        file_path: '/home/user/app/src/sum.js',
        old_string: 'return a - b',
        new_string: 'return a + b',
      },
      { tool: 'Bash', command: 'npm test', description: 'Run the tests' },
      { tool: 'Bash', command: 'rm -rf build', description: 'Remove the build output' },
    ])
  })
})

describe('busy session workspace', () => {
  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'busy-'))
    for (const { path, data } of BUSY_WORKSPACE_FILES) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), data)
    }
    return dir
  }

  function runTests(dir: string): { status: number; stdout: string } {
    try {
      return { status: 0, stdout: execFileSync('sh', ['test.sh'], { cwd: dir, encoding: 'utf8' }) }
    } catch (error) {
      const failed = error as { status: number; stdout: string }
      return { status: failed.status, stdout: failed.stdout }
    }
  }

  it('runs test.sh as its npm test script, and has a build folder to remove', () => {
    const files = new Map(BUSY_WORKSPACE_FILES.map((f) => [f.path, f.data]))

    expect(JSON.parse(String(files.get('package.json'))).scripts).toEqual({ test: 'sh test.sh' })
    expect([...files.keys()].filter((path) => path.startsWith('build/'))).toHaveLength(1)
  })

  it("fails its tests until the busy session's Edit lands, then passes them, with fixed output", () => {
    const dir = workspace()
    const edit = feedFile(feedScenario(), null, NOW_MS).busy.find((call) => call.tool === 'Edit')
    if (edit?.tool !== 'Edit') throw new Error('the busy session makes no Edit')
    const source = join(dir, 'src/sum.js')

    expect(runTests(dir)).toEqual({ status: 1, stdout: 'Tests: 1 failed, 2 passed, 3 total\n' })
    writeFileSync(source, readFileSync(source, 'utf8').replace(edit.old_string, edit.new_string))
    expect(runTests(dir)).toEqual({ status: 0, stdout: 'Tests: 3 passed, 3 total\n' })
  })
})

describe('busySettings', () => {
  it('allows exactly the busy session calls, and denies every rm -rf', () => {
    expect(busySettings(feedScenario()).permissions).toEqual({
      allow: [
        'Bash(npm test)',
        'Read(//home/user/app/src/sum.js)',
        'Edit(//home/user/app/src/sum.js)',
      ],
      deny: ['Bash(rm -rf:*)'],
    })
  })

  it("runs the tests outside Desktop's Bash sandbox, which cannot start in a hardened sandbox", () => {
    expect(busySettings(feedScenario()).sandbox).toEqual({
      enabled: false,
      excludedCommands: ['npm test'],
    })
  })
})

describe('cannedReply', () => {
  it('reports the scenario current usage, so the engine counts the same context', () => {
    expect(cannedReply(feedScenario()).usage).toEqual({
      input_tokens: 37_000,
      output_tokens: 1_400,
      cache_creation_input_tokens: 5_000,
      cache_read_input_tokens: 2_000,
    })
  })

  it('follows the scenario when it changes', () => {
    const { usage: reply } = cannedReply(withStdin({ context_window: usage(48) }))

    expect(
      reply.input_tokens + reply.cache_creation_input_tokens + reply.cache_read_input_tokens,
    ).toBe(96_000)
  })
})
