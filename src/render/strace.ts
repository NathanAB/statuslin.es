import type { BehaviorTrace } from './types'

/** Cap how many trace lines we parse, so a flood of syscalls can't exhaust CPU/memory. */
const MAX_TRACE_LINES = 5000
/** Cap how many entries we keep per trace category. */
const MAX_TRACE_ENTRIES = 200

/** Paths a hostile script might read to exfiltrate credentials; flagged in the trace. */
const SENSITIVE_PATHS = ['/root/.ssh', '/home/user/.ssh', '.aws', '.gitconfig', '/etc/passwd']

/**
 * Parses the strace output into a behavior trace.
 *
 * BEST-EFFORT, NOT YET AUTHORITATIVE. Do not gate auto-reject or transparency-badge logic
 * on this trace as it stands today:
 * - The trace file lives in a world-writable path (`/tmp`) and strace runs in the traced
 *   process's own user context, so a hostile script can poison or truncate it.
 * - Spawn (execve) detection is incomplete and can be evaded.
 *
 * Slice 3/6 must run strace as root with a write-protected sink before anything trusts this.
 * Until then, treat an empty/clean trace as "needs human review," NEVER as "safe."
 */
export function parseStrace(log: string): BehaviorTrace {
  const networkAttempts: string[] = []
  const sensitiveReads: string[] = []
  const spawnedProcesses: string[] = []
  const push = (arr: string[], line: string): void => {
    if (arr.length < MAX_TRACE_ENTRIES) arr.push(line.trim().slice(0, 200))
  }
  // Bound the read: a hostile script can emit millions of syscalls.
  const lines = log.split('\n', MAX_TRACE_LINES)
  for (const line of lines) {
    if (/\bconnect\(/.test(line)) push(networkAttempts, line)
    if (/\bopenat\(/.test(line) && SENSITIVE_PATHS.some((p) => line.includes(p))) {
      push(sensitiveReads, line)
    }
    if (line.includes('execve(')) push(spawnedProcesses, line)
  }
  return { networkAttempts, sensitiveReads, spawnedProcesses }
}
