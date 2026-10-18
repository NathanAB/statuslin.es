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
})
