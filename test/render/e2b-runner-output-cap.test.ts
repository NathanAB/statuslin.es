import { CommandExitError, type CommandStartOpts, TimeoutError } from 'e2b'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_RENDER_STDOUT_BYTES } from '@/render/pipeline'
import { SCENARIOS } from '@/render/scenarios'
import { MAX_TRACE_BYTES } from '@/render/strace'

const fakeSandbox = vi.hoisted(() => ({
  files: { write: vi.fn(), read: vi.fn() },
  commands: { run: vi.fn() },
  kill: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('e2b', async (importOriginal) => {
  const actual = await importOriginal<typeof import('e2b')>()
  return { ...actual, Sandbox: { create: vi.fn().mockResolvedValue(fakeSandbox) } }
})

import { E2BSandboxRunner } from '@/render/e2b-runner'
import { OUTPUT_LIMIT_EXIT_CODE } from '@/render/run-script'

const CHUNK = 'A'.repeat(4096)
/** What a script printing nonstop for its 5 s could send, far past any cap. */
const FLOOD_BYTES = 64 * 1024 * 1024

function firstScenario() {
  const [scenario] = SCENARIOS
  if (!scenario) throw new Error('no scenarios')
  return scenario
}

/** Stands in for the SDK running the script: streams output through the callbacks until the
 * request is aborted (the SDK then rejects with a TimeoutError) or the flood ends. */
function floodingScript(stream: 'onStdout' | 'onStderr', sent: { bytes: number }) {
  return async (_cmd: string, opts: CommandStartOpts): Promise<never> => {
    while (sent.bytes < FLOOD_BYTES) {
      if (opts.signal?.aborted) throw new TimeoutError('canceled')
      await opts[stream]?.(CHUNK)
      sent.bytes += CHUNK.length
      await Promise.resolve()
    }
    throw new TimeoutError('deadline exceeded')
  }
}

/** The setup command succeeds; the script command (the one reading input.json) runs `script`. */
function runScript(script: (cmd: string, opts: CommandStartOpts) => Promise<unknown>): void {
  fakeSandbox.commands.run.mockImplementation((cmd: string, opts: CommandStartOpts) =>
    cmd.includes('input.json') ? script(cmd, opts) : Promise.resolve({ exitCode: 0 }),
  )
}

function render() {
  return new E2BSandboxRunner().render({
    script: 'yes',
    interpreter: 'bash',
    scenario: firstScenario(),
  })
}

beforeEach(() => {
  process.env.E2B_API_KEY = 'test-key'
  fakeSandbox.files.write.mockReset().mockResolvedValue(undefined)
  fakeSandbox.files.read.mockReset().mockResolvedValue('')
  fakeSandbox.commands.run.mockReset()
  fakeSandbox.kill.mockClear()
})

describe('E2BSandboxRunner output cap', () => {
  it.each([
    ['stdout', 'onStdout'],
    ['stderr', 'onStderr'],
  ] as const)('stops a script flooding %s once it passes the cap', async (field, stream) => {
    const sent = { bytes: 0 }
    runScript(floodingScript(stream, sent))

    const result = await render()

    expect(sent.bytes).toBeLessThanOrEqual(MAX_RENDER_STDOUT_BYTES + CHUNK.length)
    expect(Buffer.byteLength(result[field])).toBeGreaterThan(MAX_RENDER_STDOUT_BYTES)
    expect(Buffer.byteLength(result[field])).toBeLessThanOrEqual(
      MAX_RENDER_STDOUT_BYTES + CHUNK.length,
    )
    expect(result).toMatchObject({ exitCode: OUTPUT_LIMIT_EXIT_CODE, timedOut: false })
    expect(fakeSandbox.kill).toHaveBeenCalledOnce()
  })

  it('still reports a script that runs past the time limit as timed out', async () => {
    runScript(() => Promise.reject(new TimeoutError('deadline exceeded')))

    expect(await render()).toMatchObject({ exitCode: 124, timedOut: true })
  })

  it("keeps a failing script's own exit code and output", async () => {
    runScript(() =>
      Promise.reject(
        new CommandExitError({ exitCode: 3, error: 'exit 3', stdout: 'out', stderr: '' }),
      ),
    )

    expect(await render()).toMatchObject({ exitCode: 3, stdout: 'out', timedOut: false })
  })

  it('reads at most the trace cap from the script-writable trace file', async () => {
    runScript(() => Promise.resolve({ exitCode: 0, stdout: 'ok', stderr: '' }))
    let pulled = 0
    const line = new TextEncoder().encode('connect(3, {sa_family=AF_INET}) = 0\n'.repeat(100))
    fakeSandbox.files.read.mockResolvedValue(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += line.byteLength
          controller.enqueue(line)
        },
      }),
    )

    const result = await render()

    expect(pulled).toBeLessThanOrEqual(MAX_TRACE_BYTES + 2 * line.byteLength)
    expect(result.trace.networkAttempts.length).toBeGreaterThan(0)
  })
})
