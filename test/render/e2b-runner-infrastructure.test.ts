import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SCENARIOS } from '@/render/scenarios'

const fakeSandbox = vi.hoisted(() => ({
  files: {
    write: vi.fn(),
    read: vi.fn().mockResolvedValue(''),
  },
  commands: { run: vi.fn() },
  kill: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('e2b', async (importOriginal) => {
  const actual = await importOriginal<typeof import('e2b')>()
  return {
    ...actual,
    Sandbox: { create: vi.fn().mockResolvedValue(fakeSandbox) },
  }
})

import { E2BSandboxRunner } from '@/render/e2b-runner'

describe('E2BSandboxRunner Anthropic infrastructure failures', () => {
  beforeEach(() => {
    process.env.E2B_API_KEY = 'test-key'
    fakeSandbox.files.write.mockReset()
    fakeSandbox.commands.run.mockReset()
    fakeSandbox.kill.mockClear()
  })

  it('maps trusted mock fixture write failures to exit 125 and tears down', async () => {
    fakeSandbox.files.write.mockRejectedValue(new Error('fixture write failed'))
    const scenario = SCENARIOS.find((candidate) => candidate.key === 'fresh-session')
    if (!scenario) throw new Error('fresh-session scenario missing')

    const result = await new E2BSandboxRunner().render({
      script: 'print("unused")',
      interpreter: 'python',
      scenario,
      networkHosts: ['api.anthropic.com'],
      readsClaudeToken: true,
    })

    expect(result).toMatchObject({
      exitCode: 125,
      timedOut: false,
      stdout: '',
    })
    expect(result.stderr).toContain('Anthropic usage mock setup failed')
    expect(fakeSandbox.commands.run).not.toHaveBeenCalled()
    expect(fakeSandbox.kill).toHaveBeenCalledOnce()
  })

  it('maps trusted response construction failures to exit 125 and tears down', async () => {
    fakeSandbox.files.write.mockResolvedValue(undefined)
    const scenario = SCENARIOS.find((candidate) => candidate.key === 'fresh-session')
    if (!scenario) throw new Error('fresh-session scenario missing')

    const result = await new E2BSandboxRunner().render({
      script: 'print("unused")',
      interpreter: 'python',
      scenario: { ...scenario, stdin: { ...scenario.stdin, rate_limits: 'invalid' } },
      networkHosts: ['api.anthropic.com'],
      readsClaudeToken: true,
    })

    expect(result.exitCode).toBe(125)
    expect(result.stderr).toContain('Anthropic usage mock setup failed')
    expect(fakeSandbox.commands.run).not.toHaveBeenCalled()
    expect(fakeSandbox.kill).toHaveBeenCalledOnce()
  })
})
