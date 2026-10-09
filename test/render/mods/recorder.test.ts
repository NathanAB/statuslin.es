import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCuration } from '@/mods/curation'
import curation from '@/mods/curation.json'
import { SANDBOX_CLAUDE_CODE_BIN } from '@/render/e2b-template'
import type { RecordingSandbox } from '@/render/mods/mod-sandbox'
import {
  e2bModRecorder,
  MAX_INPUT_STEPS,
  RECORDING_MAX_BYTES,
  recordInSandbox,
} from '@/render/mods/recorder'
import { feedScenario } from '@/render/mods/scenario-feed'
import { sessionFiles, setupCommand } from '@/render/mods/session'

const SESSION_TEST_TIMEOUT_MS = 20_000

type Emit = (text: string | Uint8Array) => void

/** A sandbox whose pty answers each input with `respond`; it records every command and file. */
function fakeSandbox(respond: (input: string, emit: Emit) => void, onOpen: (emit: Emit) => void) {
  const commands: string[] = []
  const writtenPaths: string[] = []
  const pty = { killed: false }
  const sandbox: RecordingSandbox = {
    pluginDir: '/home/user/plugins/mod',
    run: async (command) => {
      commands.push(command)
      const stdout = command.endsWith('--version') ? '2.1.296 (Claude Code)\n' : ''
      return { exitCode: 0, stdout, stderr: '' }
    },
    writeFiles: async (files) => {
      writtenPaths.push(...files.map((f) => f.path))
    },
    openTerminal: async ({ onData }) => {
      const emit: Emit = (data) => {
        if (!pty.killed) onData(typeof data === 'string' ? new TextEncoder().encode(data) : data)
      }
      onOpen(emit)
      return {
        send: async (input) => respond(input, emit),
        kill: async () => {
          pty.killed = true
        },
      }
    },
  }
  return { sandbox, commands, writtenPaths, pty }
}

const isLaunch = (input: string) => input.startsWith('clear; ')

describe('recordInSandbox', () => {
  it(
    'replays the session on the host, running nothing in the sandbox but the version check and setup',
    async () => {
      const fake = fakeSandbox(
        (input, emit) => {
          if (isLaunch(input)) emit('\u001b[2J\u001b[Hwelcome\r\n\u001b[1m❯\u001b[0m ')
          else if (input === '\r') emit('\r\n● The repo is clean.\r\n❯ ')
          else emit(input)
        },
        (emit) => emit('shell banner $ '),
      )

      const recording = await recordInSandbox(fake.sandbox, { mod: null, inputSteps: [] })

      expect(recording.claudeCodeVersion).toBe('2.1.296')
      expect(recording.rows.slice(0, 4)).toEqual([
        'welcome',
        '\u001b[0;1m❯\u001b[0m hello',
        '● The repo is clean.',
        '❯',
      ])
      expect(recording.rows.join('\n')).not.toContain('shell banner')
      expect(fake.commands).toEqual([
        `${SANDBOX_CLAUDE_CODE_BIN} --version`,
        setupCommand(feedScenario()),
      ])
      const seed = { target: null, nowMs: 0, claudeCodeVersion: '2.1.296' }
      expect(fake.writtenPaths).toEqual(sessionFiles(feedScenario(), seed).map((f) => f.path))
      expect(fake.pty.killed).toBe(true)
    },
    SESSION_TEST_TIMEOUT_MS,
  )

  it(
    'fails the recording as soon as a flood passes the byte cap, and kills the pty',
    async () => {
      const chunk = new Uint8Array(256 * 1024).fill(0x79)
      let floodStartedAt = 0
      const fake = fakeSandbox(
        (input, emit) => {
          if (!isLaunch(input)) return
          floodStartedAt = performance.now()
          const flood = setInterval(() => {
            if (fake.pty.killed) clearInterval(flood)
            else emit(chunk)
          }, 1)
        },
        () => {},
      )

      const recording = recordInSandbox(fake.sandbox, { mod: null, inputSteps: [] })

      await expect(recording).rejects.toThrow(`pty output passed ${RECORDING_MAX_BYTES} bytes`)
      expect(performance.now() - floodStartedAt).toBeLessThan(1_000)
      expect(fake.pty.killed).toBe(true)
    },
    SESSION_TEST_TIMEOUT_MS,
  )
})

describe('e2bModRecorder', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses up front a request whose steps cannot finish inside the sandbox lifetime', async () => {
    // No key, so a missing check fails on sandbox creation instead of spending a real sandbox.
    vi.stubEnv('E2B_API_KEY', '')
    const inputSteps = Array.from({ length: MAX_INPUT_STEPS + 1 }, () => ({
      type: 'text' as const,
      text: '/radar',
    }))

    await expect(e2bModRecorder.record({ mod: null, inputSteps })).rejects.toThrow(
      `${MAX_INPUT_STEPS + 1} input steps cannot finish inside the sandbox lifetime`,
    )
  })

  it('fits every curated mod', () => {
    const parsed = parseCuration(curation)
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'))

    for (const entry of parsed.entries) {
      expect(entry.inputSteps.length).toBeLessThanOrEqual(MAX_INPUT_STEPS)
    }
  })
})
