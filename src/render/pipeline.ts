import { parseAnsi } from './ansi'
import { resolveResets } from './scenario-helpers'
import { SCENARIOS } from './scenarios'
import type { Interpreter, RenderedPreview, SandboxRunner } from './types'

/**
 * Hard cap on a single scenario's captured stdout before we store or render it. The E2B sandbox
 * bounds a script's wall-clock time (~5s) but NOT its output bytes, so a script that floods stdout
 * (`yes A | head -c 5MB`, a print loop) would otherwise land megabytes in `raw_stdout` (text) +
 * `segments` (jsonb) and ship them in every SSR payload / DOM. A statusline is one short line; 16 KB
 * is hundreds of lines — generous for any legitimate render while bounding storage + DOM weight.
 * Bytes (not code units) because stdout carries multibyte UTF-8 / ANSI escapes.
 */
export const MAX_RENDER_STDOUT_BYTES = 16 * 1024

/** Appended (plain text, after the byte cut) so a truncated preview reads as deliberately cut. */
const TRUNCATION_MARKER = '\n…[output truncated]'

/**
 * Bound stdout to MAX_RENDER_STDOUT_BYTES by bytes. Returns the input unchanged when it fits, else
 * the longest whole-character prefix within the cap plus a visible marker. A trailing escape may be
 * sliced mid-sequence; `parseAnsi` (Anser) tolerates that and the marker is appended as plain text.
 */
function capStdout(stdout: string): string {
  if (Buffer.byteLength(stdout) <= MAX_RENDER_STDOUT_BYTES) return stdout
  // Slice by bytes, then drop a trailing partial UTF-8 unit so we never emit a lone surrogate / half-codepoint.
  const truncated = Buffer.from(stdout)
    .toString('utf8', 0, MAX_RENDER_STDOUT_BYTES)
    .replace(/�+$/, '')
  return truncated + TRUNCATION_MARKER
}

export async function renderConfig(
  config: { script: string; interpreter: Interpreter; networkHosts?: string[] },
  runner: SandboxRunner,
): Promise<RenderedPreview[]> {
  const previews: RenderedPreview[] = []
  // Rate-limit resets are authored as offsets-from-now; resolve them to live epochs at render time.
  const nowSec = Math.floor(Date.now() / 1000)
  // Network configs render the same full scenario set as offline ones — the sandbox just has the
  // network on (config.networkHosts flows through to the runner below). Scenarios differ in the
  // visible output (cwd, model, git state), so a single preview would undersell the gallery card.
  for (const scenario of SCENARIOS) {
    const stdin = resolveResets(scenario.stdin, nowSec)
    const result = await runner.render({ ...config, scenario: { ...scenario, stdin } })
    // Single choke point: capping here bounds BOTH `rawStdout` and the derived `segments`, for
    // BOTH runners (real e2b + fake) — every render flows through this loop.
    const stdout = capStdout(result.stdout)
    previews.push({
      scenarioKey: scenario.key,
      segments: parseAnsi(stdout),
      rawStdout: stdout,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      trace: result.trace,
    })
  }
  return previews
}
