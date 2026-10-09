import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Main checkout's staging env file, found from the shared git dir so it works in a worktree. */
function stagingEnvPath(): string {
  const commonDir = Bun.spawnSync(['git', 'rev-parse', '--git-common-dir'], {
    cwd: import.meta.dirname,
  })
    .stdout.toString()
    .trim()
  return resolve(import.meta.dirname, commonDir, '..', '.env.staging')
}

/** The E2B key, from the process env or the staging env file. Never printed or written. */
export function e2bApiKey(): string {
  const fromEnv = process.env.E2B_API_KEY
  if (fromEnv) return fromEnv
  const line = readFileSync(stagingEnvPath(), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('E2B_API_KEY='))
  const key = line
    ?.slice('E2B_API_KEY='.length)
    .trim()
    .replace(/^["']|["']$/g, '')
  if (!key) throw new Error('E2B_API_KEY not found in env or .env.staging')
  return key
}
