export const INTERPRETERS = ['bash', 'node', 'python'] as const
export type Interpreter = (typeof INTERPRETERS)[number]

/** A session state we render the statusline against. */
export interface Scenario {
  key: string
  label: string
  /** A terse label (≤13 chars) for stacked-preview rows on the detail page. */
  shortLabel: string
  /** The JSON Claude Code pipes to the statusline command on stdin. */
  stdin: Record<string, unknown>
  /** Fake git repo to set up at stdin.workspace.current_dir, or null for a non-git dir. */
  git: { branch: string; dirty: boolean } | null
  /** Extra env vars Claude Code would set (e.g. COLUMNS/LINES). */
  env: Record<string, string>
}

export interface RenderInput {
  script: string
  interpreter: Interpreter
  scenario: Scenario
  /** Allowlisted hostnames for this render. Empty/undefined = network off. */
  networkHosts?: string[]
}

export interface BehaviorTrace {
  networkAttempts: string[]
  sensitiveReads: string[]
  spawnedProcesses: string[]
}

export interface RenderResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
  trace: BehaviorTrace
}

export interface AnsiSegment {
  text: string
  fg: string | null
  bg: string | null
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface RenderedPreview {
  scenarioKey: string
  segments: AnsiSegment[]
  rawStdout: string
  exitCode: number
  timedOut: boolean
  trace: BehaviorTrace
}

export interface SandboxRunner {
  render(input: RenderInput): Promise<RenderResult>
}
