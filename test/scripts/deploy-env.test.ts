import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseDeployEnv, spawnVarlock, varlockEnv } from '../../scripts/deploy-env'

describe('parseDeployEnv', () => {
  it.each(['staging', 'production'] as const)('accepts %s', (name) => {
    expect(parseDeployEnv(name)).toBe(name)
  })

  it.each([undefined, 'prod', 'development', '--dry-run'])('rejects %s', (name) => {
    expect(() => parseDeployEnv(name)).toThrow('expected staging or production')
  })
})

describe('varlockEnv', () => {
  it('passes varlock only system variables plus APP_ENV, never config from .env.local or the shell', () => {
    const env = varlockEnv(
      {
        PATH: '/usr/bin',
        HOME: '/Users/me',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/statuslines',
        RENDER_RUNNER: 'fake',
        APP_ENV: 'development',
        VARLOCK_FOO: 'bar',
      },
      'production',
    )
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/me',
      VARLOCK_FOO: 'bar',
      APP_ENV: 'production',
      VARLOCK_TELEMETRY_DISABLED: 'true',
    })
  })
})

describe('spawnVarlock', () => {
  const root = mkdtempSync(join(tmpdir(), 'deploy-env-'))
  const main = join(root, 'main')
  const worktree = join(root, 'worktree')
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd })
  execFileSync('git', ['init', '-q', main])
  writeFileSync(join(main, '.env.schema'), '# @defaultRequired=false\n# ---\nFOO=\n')
  git(main, 'add', '.env.schema')
  git(main, 'commit', '-qm', 'schema')
  // Like the real repo: the deploy env file is gitignored, so only the main checkout has it.
  writeFileSync(join(main, '.env.staging'), 'FOO=from-main\n')
  git(main, 'worktree', 'add', '-q', worktree)
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it.each([
    ['the main checkout', main],
    ['a worktree', worktree],
  ])("reads the main checkout's env file from %s", (_, cwd) => {
    const printed = spawnVarlock('printenv', 'staging', ['FOO'], { cwd })
    expect(printed.stderr).toBe('')
    expect(printed.stdout.trim()).toBe('from-main')
  })
})
