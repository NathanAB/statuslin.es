import type { BehaviorTrace, RenderInput, RenderResult, SandboxRunner } from './types'

type FakeOutput = {
  stdout?: string
  stderr?: string
  exitCode?: number
  timedOut?: boolean
  trace?: Partial<BehaviorTrace>
}

const EMPTY_TRACE: BehaviorTrace = { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] }

/** Deterministic in-memory runner for tests + key-less CLI runs. Keyed by scenario.key. */
export class FakeSandboxRunner implements SandboxRunner {
  constructor(private readonly outputs: Record<string, FakeOutput> = {}) {}

  async render(input: RenderInput): Promise<RenderResult> {
    const o = this.outputs[input.scenario.key] ?? {}
    return {
      stdout: o.stdout ?? '',
      stderr: o.stderr ?? '',
      exitCode: o.exitCode ?? 0,
      timedOut: o.timedOut ?? false,
      trace: { ...EMPTY_TRACE, ...o.trace },
    }
  }
}
