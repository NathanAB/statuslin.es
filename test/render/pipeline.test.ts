import { describe, expect, it } from 'vitest'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { MAX_RENDER_STDOUT_BYTES, renderConfig } from '@/render/pipeline'
import { SCENARIOS } from '@/render/scenarios'
import type { RenderInput, SandboxRunner } from '@/render/types'

describe('renderConfig', () => {
  it('renders every scenario into a preview with parsed segments', async () => {
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: '\x1b[35mOpus\x1b[0m main' } })
    const previews = await renderConfig(
      { script: '#!/bin/bash\necho hi', interpreter: 'bash' },
      runner,
    )
    expect(previews).toHaveLength(8)
    const clean = previews.find((p) => p.scenarioKey === 'clean-main')!
    expect(clean.rawStdout).toBe('\x1b[35mOpus\x1b[0m main')
    expect(clean.segments.map((s) => s.text).join('')).toBe('Opus main')
    expect(clean.segments[0]?.fg).toBeTruthy()
  })
  it('caps oversized stdout so a flooding script cannot store/serve megabytes', async () => {
    // A hostile script bounded only by wall-clock can still print MBs (`yes A | head -c 5MB`).
    const flood = 'x'.repeat(1_000_000)
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: flood } })
    const previews = await renderConfig({ script: '', interpreter: 'bash' }, runner)
    const clean = previews.find((p) => p.scenarioKey === 'clean-main')!

    // rawStdout is bounded to the cap plus a short truncation marker — never the full 1MB.
    expect(Buffer.byteLength(clean.rawStdout)).toBeLessThanOrEqual(MAX_RENDER_STDOUT_BYTES + 64)
    expect(clean.rawStdout.length).toBeLessThan(flood.length)
    expect(clean.rawStdout).toContain('[output truncated]')

    // segments derive from the capped stdout, so they're bounded too (no multi-MB jsonb).
    const segmentBytes = Buffer.byteLength(clean.segments.map((s) => s.text).join(''))
    expect(segmentBytes).toBeLessThanOrEqual(MAX_RENDER_STDOUT_BYTES + 64)
  })
  it('does not throw when the byte cut lands inside an ANSI escape sequence', async () => {
    // All escapes, so the 16 KB cut necessarily lands mid-sequence (a dangling CSI like `\x1b[31`).
    const flood = '\x1b[31m'.repeat(4000) // ~20 KB
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: flood } })
    const previews = await renderConfig({ script: '', interpreter: 'bash' }, runner)
    const clean = previews.find((p) => p.scenarioKey === 'clean-main')!
    expect(Buffer.byteLength(clean.rawStdout)).toBeLessThanOrEqual(MAX_RENDER_STDOUT_BYTES + 64)
    expect(clean.rawStdout).toContain('[output truncated]')
  })
  it('leaves stdout under the cap untouched (no marker, byte-for-byte)', async () => {
    const small = '\x1b[35mOpus\x1b[0m main'
    const runner = new FakeSandboxRunner({ 'clean-main': { stdout: small } })
    const previews = await renderConfig({ script: '', interpreter: 'bash' }, runner)
    const clean = previews.find((p) => p.scenarioKey === 'clean-main')!
    expect(clean.rawStdout).toBe(small)
    expect(clean.rawStdout).not.toContain('[output truncated]')
  })
  it('preserves exitCode, timedOut, and the trace per scenario', async () => {
    const runner = new FakeSandboxRunner({
      'non-git': {
        stdout: 'x',
        exitCode: 1,
        timedOut: true,
        trace: { sensitiveReads: ['/root/.ssh/id_rsa'] },
      },
    })
    const previews = await renderConfig({ script: '', interpreter: 'bash' }, runner)
    const ng = previews.find((p) => p.scenarioKey === 'non-git')!
    expect(ng.exitCode).toBe(1)
    expect(ng.timedOut).toBe(true)
    expect(ng.trace.sensitiveReads).toContain('/root/.ssh/id_rsa')
  })
  it('attaches per-scenario fixtures (transcript + todos) to each render input', async () => {
    const seen: RenderInput[] = []
    const runner: SandboxRunner = {
      async render(input) {
        seen.push(input)
        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          timedOut: false,
          trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
        }
      },
    }
    await renderConfig({ script: '', interpreter: 'bash' }, runner)

    const near = seen.find((i) => i.scenario.key === 'near-full')!
    const stdin = near.scenario.stdin as {
      transcript_path: string
      session_id: string
      model: { id: string }
    }
    const paths = (near.fixtures ?? []).map((f) => f.path)
    expect(paths).toContain(stdin.transcript_path)
    expect(paths).toContain(
      `/home/user/.claude/todos/${stdin.session_id}-agent-${stdin.session_id}.json`,
    )
    const transcript = near.fixtures?.find((f) => f.path === stdin.transcript_path)
    expect(transcript?.content).toContain(stdin.model.id)

    // fresh-session: transcript only — a just-started session has no todo file yet.
    const fresh = seen.find((i) => i.scenario.key === 'fresh-session')!
    expect(fresh.fixtures).toHaveLength(1)
    expect(fresh.fixtures?.[0]?.content.length ?? 0).toBeGreaterThan(0)
  })
})

describe('renderConfig network mode', () => {
  it('renders every scenario for a network config, same as offline', async () => {
    const runner = new FakeSandboxRunner()
    const previews = await renderConfig(
      { script: '', interpreter: 'bash', networkHosts: ['wttr.in'] },
      runner,
    )
    expect(previews).toHaveLength(SCENARIOS.length)
  })

  it('forwards networkHosts to the runner on every scenario', async () => {
    const seen: (string[] | undefined)[] = []
    const runner = {
      render: async (input: Parameters<FakeSandboxRunner['render']>[0]) => {
        seen.push(input.networkHosts)
        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          timedOut: false,
          trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
        }
      },
    }
    await renderConfig({ script: '', interpreter: 'bash', networkHosts: ['wttr.in'] }, runner)
    expect(seen).toHaveLength(SCENARIOS.length)
    expect(seen.every((h) => h?.length === 1 && h[0] === 'wttr.in')).toBe(true)
  })

  it('renders all scenarios when there are no networkHosts (offline, unchanged)', async () => {
    const previews = await renderConfig(
      { script: '', interpreter: 'bash' },
      new FakeSandboxRunner(),
    )
    expect(previews).toHaveLength(SCENARIOS.length)
  })
})
