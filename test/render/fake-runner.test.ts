import { describe, expect, it } from 'vitest'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { SCENARIOS } from '@/render/scenarios'

describe('FakeSandboxRunner', () => {
  it('returns the configured stdout for a scenario key', async () => {
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: 'opus | main' } })
    const res = await runner.render({
      script: '#!/bin/bash\necho hi',
      interpreter: 'bash',
      scenario: SCENARIOS.find((s) => s.key === 'clean-main')!,
    })
    expect(res.stdout).toBe('opus | main')
    expect(res.exitCode).toBe(0)
    expect(res.trace).toEqual({ networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] })
  })
  it('can simulate a network attempt in the trace', async () => {
    const runner = new FakeSandboxRunner({
      'clean-main': { stdout: 'x', trace: { networkAttempts: ['connect 1.2.3.4:443'] } },
    })
    const scenario = SCENARIOS[0]
    if (!scenario) throw new Error('SCENARIOS is empty')
    const res = await runner.render({ script: '', interpreter: 'bash', scenario })
    expect(res.trace.networkAttempts).toContain('connect 1.2.3.4:443')
  })
})
