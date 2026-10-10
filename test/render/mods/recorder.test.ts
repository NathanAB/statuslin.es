import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCuration } from '@/mods/curation'
import curation from '@/mods/curation.json'
import { SANDBOX_CLAUDE_CODE_BIN } from '@/render/e2b-template'
import type {
  RecordingSandbox,
  ReplaySandbox,
  SandboxFile,
  withRecordingSandbox,
  withReplaySandbox,
} from '@/render/mods/mod-sandbox'
import {
  e2bModRecorder,
  MAX_INPUT_STEPS,
  modRecorder,
  PTY_MAX_BYTES,
  PtyOutput,
  recordInSandbox,
} from '@/render/mods/recorder'
import { feedScenario } from '@/render/mods/scenario-feed'
import { sessionFiles, setupCommand, TERMINAL } from '@/render/mods/session'

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

const claudeSession = (input: string, emit: Emit) => {
  if (isLaunch(input)) emit('\u001b[2J\u001b[Hwelcome\r\n\u001b[1m❯\u001b[0m ')
  else if (input === '\r') emit('\r\n● The repo is clean.\r\n❯ ')
  else emit(input)
}

describe('PtyOutput', () => {
  it('keeps nothing past the cap and reports the overflow', () => {
    const output = new PtyOutput()
    const chunk = new Uint8Array(64 * 1024)
    const chunksToCap = PTY_MAX_BYTES / chunk.byteLength

    const kept = Array.from({ length: chunksToCap + 10 }, () => output.push(chunk))

    expect(kept.filter(Boolean)).toHaveLength(chunksToCap)
    expect(output.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(PTY_MAX_BYTES)
    expect(output.overflowed).toBe(true)
  })
})

describe('recordInSandbox', () => {
  it(
    'captures the pty from the launch on, running nothing in the sandbox but the version check and setup',
    async () => {
      const fake = fakeSandbox(claudeSession, (emit) => emit('shell banner $ '))

      const capture = await recordInSandbox(fake.sandbox, { mod: null, inputSteps: [] })

      expect(capture.claudeCodeVersion).toBe('2.1.296')
      const pty = new TextDecoder().decode(capture.pty)
      expect(pty.startsWith('\u001b[2J\u001b[Hwelcome')).toBe(true)
      expect(pty).toContain('● The repo is clean.')
      expect(pty).not.toContain('shell banner')
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

      await expect(recording).rejects.toThrow(`pty output passed ${PTY_MAX_BYTES} bytes`)
      expect(performance.now() - floodStartedAt).toBeLessThan(1_000)
      expect(fake.pty.killed).toBe(true)
    },
    SESSION_TEST_TIMEOUT_MS,
  )
})

function fakeSandboxes(rows: string[]) {
  const events: string[] = []
  const uploads: SandboxFile[] = []
  const session = fakeSandbox(claudeSession, () => {})
  const replay: ReplaySandbox = {
    writeFiles: async (files) => {
      uploads.push(...files)
    },
    runBounded: async () => {
      events.push('replay')
      return { exitCode: 0, stdout: JSON.stringify(rows), stderr: '' }
    },
  }
  const recordingSandbox: typeof withRecordingSandbox = async (_source, use) => {
    events.push('create recording sandbox')
    try {
      return await use(session.sandbox)
    } finally {
      events.push('kill recording sandbox')
    }
  }
  const replaySandbox: typeof withReplaySandbox = async (use) => {
    events.push('create replay sandbox')
    try {
      return await use(replay)
    } finally {
      events.push('kill replay sandbox')
    }
  }
  const recorder = modRecorder({
    withRecordingSandbox: recordingSandbox,
    withReplaySandbox: replaySandbox,
  })
  return { recorder, events, uploads }
}

describe('modRecorder', () => {
  it(
    'replays in a second sandbox, created after the recording sandbox is killed',
    async () => {
      const printed = ['from the replay sandbox', '❯']
      const { recorder, events, uploads } = fakeSandboxes(printed)

      const recording = await recorder.record({ mod: null, inputSteps: [] })

      expect(events).toEqual([
        'create recording sandbox',
        'kill recording sandbox',
        'create replay sandbox',
        'replay',
        'kill replay sandbox',
      ])
      expect(recording).toEqual({ rows: printed, claudeCodeVersion: '2.1.296' })
      const pty = uploads.find((f) => f.path.endsWith('recording.bin'))?.data
      expect(new TextDecoder().decode(pty as Uint8Array)).toContain('● The repo is clean.')
    },
    SESSION_TEST_TIMEOUT_MS,
  )

  it(
    'fails the recording when the replay gives more rows than the terminal has',
    async () => {
      const { recorder } = fakeSandboxes(Array(TERMINAL.rows + 1).fill(''))

      await expect(recorder.record({ mod: null, inputSteps: [] })).rejects.toThrow(
        `recording has ${TERMINAL.rows + 1} rows, over the ${TERMINAL.rows} limit`,
      )
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
