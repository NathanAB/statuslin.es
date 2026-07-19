import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

export type RunPrompt = (prompt: string) => Promise<string>

/** Legacy runner for the separate tag-backfill utility. Content generation uses the
 * agent-agnostic prepare/apply protocol in scripts/generate-content.ts instead. */
export const runClaude: RunPrompt = async (prompt) => {
  const result = spawnSync('claude', ['-p', '--tools', ''], {
    cwd: tmpdir(),
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw new Error(`failed to run \`claude\`: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`claude -p exited ${result.status}: ${result.stderr}`)
  return result.stdout
}
