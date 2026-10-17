/**
 * Run a script against staging or production config, from `.env.schema` and `.env.<env>`
 * (decrypting asks for Touch ID):
 *   bun run with-env staging|production <script.ts> [args...]
 *   e.g. bun run with-env staging scripts/generate-content.ts --all --prepare
 *
 * The script runs under `bun --no-env-file`, so neither .env.local nor .env.development can fill in
 * a value the env file leaves unset.
 */
import { type DeployEnv, parseDeployEnv, spawnVarlock } from './deploy-env'

/** Returns the script's exit status. */
export function runWithDeployEnv(
  deployEnv: DeployEnv,
  scriptArgs: string[],
  cwd = process.cwd(),
): number {
  const ran = spawnVarlock(
    'run',
    deployEnv,
    ['--inject', 'vars', '--', 'bun', '--no-env-file', ...scriptArgs],
    { cwd, stdio: 'inherit' },
  )
  return ran.status ?? 1
}

if (import.meta.main) {
  const [envArg, ...scriptArgs] = process.argv.slice(2)
  try {
    if (scriptArgs.length === 0)
      throw new Error('usage: bun run with-env staging|production <script.ts> [args...]')
    process.exit(runWithDeployEnv(parseDeployEnv(envArg), scriptArgs))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
