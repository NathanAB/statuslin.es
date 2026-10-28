/**
 * What the scripts that load staging or production config share: the env names, and running varlock
 * on one env's files and nothing else. Used by push-secrets.ts and with-deploy-env.ts.
 */
import { execFileSync, type StdioOptions, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEPLOY_ENVS = ['staging', 'production'] as const
export type DeployEnv = (typeof DEPLOY_ENVS)[number]

export function parseDeployEnv(arg: string | undefined): DeployEnv {
  const deployEnv = DEPLOY_ENVS.find((name) => name === arg)
  if (!deployEnv) throw new Error(`expected staging or production, got ${arg ?? 'nothing'}`)
  return deployEnv
}

/** The repo's own varlock, so running from any directory never makes bunx fetch one. */
const VARLOCK_BIN = fileURLToPath(new URL('../node_modules/.bin/varlock', import.meta.url))

/**
 * The env file lives only in the main checkout (it's gitignored), so a worktree reads that one
 * instead of keeping a copy that goes stale when secrets change.
 */
export function deployEnvFile(deployEnv: DeployEnv, cwd: string): string {
  const file = `.env.${deployEnv}`
  if (existsSync(join(cwd, file))) return file
  const commonDir = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd, encoding: 'utf8' },
  ).trim()
  return join(dirname(commonDir), file)
}

/**
 * Run `varlock load|run|printenv` on one env's config, kept apart from local config three ways. It loads the
 * schema and the env file only, since a directory load would also layer .env.local and
 * .env.development. It gets none of this process's config vars (see varlockEnv). And its own runtime
 * loads no env files: varlock's bin starts with `#!/usr/bin/env node`, and under `bun --bun` that
 * node is Bun, which would auto-load the dev files into varlock's env.
 */
export function spawnVarlock(
  command: 'load' | 'run' | 'printenv',
  deployEnv: DeployEnv,
  args: string[],
  { cwd, stdio = 'pipe' }: { cwd: string; stdio?: StdioOptions },
) {
  return spawnSync(
    'bun',
    [
      '--no-env-file',
      VARLOCK_BIN,
      command,
      '-p',
      '.env.schema',
      '-p',
      deployEnvFile(deployEnv, cwd),
      ...args,
    ],
    { cwd, encoding: 'utf8', env: varlockEnv(process.env, deployEnv), stdio },
  )
}

const SYSTEM_VARS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'TERM']

/**
 * The environment varlock runs in. Process env outranks every file in varlock, so anything else
 * here (a shell export, or what `bun run` auto-loads from .env.local) would replace the env file's
 * values.
 */
export function varlockEnv(processEnv: NodeJS.ProcessEnv, deployEnv: DeployEnv): NodeJS.ProcessEnv {
  const kept = Object.entries(processEnv).filter(
    ([key]) => SYSTEM_VARS.includes(key) || key.startsWith('VARLOCK_'),
  )
  return {
    ...Object.fromEntries(kept),
    // biome-ignore lint/style/useNamingConvention: environment variable name.
    APP_ENV: deployEnv,
    // biome-ignore lint/style/useNamingConvention: environment variable name.
    VARLOCK_TELEMETRY_DISABLED: 'true',
  }
}
