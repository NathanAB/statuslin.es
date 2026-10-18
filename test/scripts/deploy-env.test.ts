import { describe, expect, it } from 'vitest'
import { parseDeployEnv, varlockEnv } from '../../scripts/deploy-env'

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
