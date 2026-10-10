import { CommandExitError, TimeoutError } from 'e2b'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { E2B_MOD_TEMPLATE_ID } from '@/render/e2b-template'

type OnOutput = (data: string) => void

const fake = vi.hoisted(() => ({
  sandbox: {
    files: { write: vi.fn() },
    commands: { run: vi.fn() },
    kill: vi.fn(),
  },
  create: vi.fn(),
}))

vi.mock('e2b', async (importOriginal) => {
  const actual = await importOriginal<typeof import('e2b')>()
  return { ...actual, Sandbox: { create: fake.create } }
})

import { withRecordingSandbox, withReplaySandbox } from '@/render/mods/mod-sandbox'

function command(chunks: string[], outcome: () => Promise<unknown>) {
  let killed = false
  const handle = {
    kill: vi.fn(async () => {
      killed = true
      return true
    }),
    wait: () => (killed ? Promise.reject(new Error('signal: killed')) : outcome()),
  }
  fake.sandbox.commands.run.mockImplementation(
    async (_cmd: string, opts: { onStdout: OnOutput; onStderr: OnOutput }) => {
      for (const chunk of chunks) opts.onStdout(chunk)
      return handle
    },
  )
  return handle
}

const LIMITS = { timeoutMs: 20_000, maxOutputBytes: 1_000 }

beforeEach(() => {
  vi.stubEnv('E2B_API_KEY', 'test-key')
  fake.create.mockResolvedValue(fake.sandbox)
  fake.sandbox.kill.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('withReplaySandbox', () => {
  it('opens a fresh mods sandbox with the network off and secure mode on', async () => {
    await withReplaySandbox(async () => {})

    const [template, options] = fake.create.mock.calls[0] ?? []
    expect(template).toBe(E2B_MOD_TEMPLATE_ID)
    expect(options).toMatchObject({ allowInternetAccess: false })
    expect(options).toMatchObject({ secure: true })
  })

  it('opens its sandbox the same way the recording sandbox is opened, but for less time', async () => {
    await withRecordingSandbox(null, async () => {})
    await withReplaySandbox(async () => {})

    const [recording, replay] = fake.create.mock.calls.map(([, options]) => options)
    expect({ ...replay, timeoutMs: 0 }).toEqual({ ...recording, timeoutMs: 0 })
    expect(replay.timeoutMs).toBeLessThan(recording.timeoutMs)
  })

  it('kills the sandbox when the replay throws', async () => {
    const replay = withReplaySandbox(async () => {
      throw new Error('replay failed')
    })

    await expect(replay).rejects.toThrow('replay failed')
    expect(fake.sandbox.kill).toHaveBeenCalledOnce()
  })

  it('returns a non-zero exit with its output', async () => {
    command([], async () => {
      throw new CommandExitError({
        exitCode: 1,
        stdout: '',
        stderr: 'boom',
        error: 'exit status 1',
      })
    })

    const output = await withReplaySandbox((sandbox) => sandbox.runBounded('node x', LIMITS))

    expect(output).toEqual({ exitCode: 1, stdout: '', stderr: 'boom' })
  })

  it('kills the command and fails once its output passes the cap', async () => {
    const handle = command(['x'.repeat(600), 'x'.repeat(600)], () => new Promise(() => {}))

    const run = withReplaySandbox((sandbox) => sandbox.runBounded('node x', LIMITS))

    await expect(run).rejects.toThrow(`command output passed ${LIMITS.maxOutputBytes} bytes`)
    expect(handle.kill).toHaveBeenCalled()
    expect(fake.sandbox.kill).toHaveBeenCalledOnce()
  })

  it('fails a command that runs past its timeout', async () => {
    command([], async () => {
      throw new TimeoutError('deadline exceeded')
    })

    const run = withReplaySandbox((sandbox) => sandbox.runBounded('node x', LIMITS))

    await expect(run).rejects.toThrow(`command ran past ${LIMITS.timeoutMs} ms`)
    expect(fake.sandbox.kill).toHaveBeenCalledOnce()
  })

  it('runs the command as the unprivileged user with the timeout', async () => {
    command([], async () => ({ exitCode: 0, stdout: '[]', stderr: '' }))

    await withReplaySandbox((sandbox) => sandbox.runBounded('node x', LIMITS))

    expect(fake.sandbox.commands.run).toHaveBeenCalledWith(
      'node x',
      expect.objectContaining({ user: 'user', timeoutMs: LIMITS.timeoutMs, background: true }),
    )
  })
})
