import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFlyItems, parseArgs, planPush } from '../../scripts/push-secrets'

const ENCRYPTED = 'varlock("local:not-a-real-ciphertext")'

function item(value: unknown, isSensitive = true) {
  return { value, isSensitive }
}

describe('parseArgs', () => {
  it('reads the env and the dry-run flag', () => {
    expect(parseArgs(['production', '--dry-run'])).toEqual({
      deployEnv: 'production',
      dryRun: true,
    })
    expect(parseArgs(['staging'])).toEqual({ deployEnv: 'staging', dryRun: false })
  })

  it.each([
    [['production', '--dryrun'], '--dryrun'],
    [['staging', 'production'], 'production'],
    [['--dry-run'], 'expected staging or production'],
  ])('refuses %j rather than guessing, since a guess could push for real', (args, message) => {
    expect(() => parseArgs(args)).toThrow(message)
  })
})

describe('planPush', () => {
  it('writes each value double-quoted, so a # inside it is not read as a comment by fly', () => {
    const plan = planPush({
      items: {
        DATABASE_URL: item('postgresql://app:p%23ss@db.neon.tech/statuslines?sslmode=require'),
        BETTER_AUTH_SECRET: item("a+b/c=d\\e'f #g h"),
      },
      envFileText: `DATABASE_URL=${ENCRYPTED}\nBETTER_AUTH_SECRET=${ENCRYPTED}\n`,
      flyNames: [],
    })
    expect(plan.importFile).toBe(
      [
        'DATABASE_URL="postgresql://app:p%23ss@db.neon.tech/statuslines?sslmode=require"',
        `BETTER_AUTH_SECRET="a+b/c=d\\e'f #g h"`,
        '',
      ].join('\n'),
    )
    expect(plan.set).toEqual(['DATABASE_URL', 'BETTER_AUTH_SECRET'])
  })

  it('unsets a managed secret the env file no longer sets, and only reports unmanaged ones', () => {
    const plan = planPush({
      items: {
        BETTER_AUTH_URL: item('https://statuslin.es', false),
        POSTHOG_HOST: item(null, false),
        GITHUB_TOKEN: item(null),
      },
      envFileText: 'BETTER_AUTH_URL=https://statuslin.es\n',
      flyNames: ['BETTER_AUTH_URL', 'POSTHOG_HOST', 'SOME_OTHER_TOOL_TOKEN'],
    })
    expect(plan.importFile).toBe('BETTER_AUTH_URL="https://statuslin.es"\n')
    expect(plan.unset).toEqual(['POSTHOG_HOST'])
    expect(plan.unmanaged).toEqual(['SOME_OTHER_TOOL_TOKEN'])
  })

  it('refuses a secret still in plaintext in the env file, naming only the key', () => {
    const attempt = () =>
      planPush({
        items: {
          BETTER_AUTH_URL: item('https://statuslin.es', false),
          RESEND_API_KEY: item('re_live_value'),
        },
        envFileText: [
          '# comment',
          'BETTER_AUTH_URL=https://statuslin.es',
          'RESEND_API_KEY=re_live_value',
          'DIRECT_DATABASE_URL=postgresql://a:b@direct.example/x',
          'EMPTY_ONE=',
        ].join('\n'),
        flyNames: [],
      })
    expect(attempt).toThrow(
      'RESEND_API_KEY, DIRECT_DATABASE_URL are plaintext in the env file; encrypt them first',
    )
    expect(attempt).not.toThrow('re_live_value')
  })

  it.each([
    ['no sslmode', 'postgresql://app:hunter2pw@db.neon.tech/statuslines'],
    [
      'a non-encrypting sslmode',
      'postgresql://app:hunter2pw@db.neon.tech/statuslines?sslmode=prefer',
    ],
  ])('refuses a DATABASE_URL with %s, which the deployed app would refuse to boot on', (_, url) => {
    const attempt = () =>
      planPush({
        items: { DATABASE_URL: item(url) },
        envFileText: `DATABASE_URL=${ENCRYPTED}`,
        flyNames: [],
      })
    expect(attempt).toThrow('DATABASE_URL must enforce TLS in production')
    expect(attempt).not.toThrow('hunter2pw')
  })

  it('refuses a value varlock resolved to a non-string, instead of silently leaving it out', () => {
    expect(() =>
      planPush({
        items: { GITHUB_CLIENT_ID: item(1234567, false), GITHUB_TOKEN: item(true) },
        envFileText: '',
        flyNames: [],
      }),
    ).toThrow('GITHUB_CLIENT_ID, GITHUB_TOKEN resolved to a number or boolean')
  })

  it.each([
    ['a double quote', 'abc"def'],
    ['a newline', 'line1\nline2'],
  ])('refuses a value containing %s, which fly import cannot read back exactly', (_, value) => {
    const attempt = () =>
      planPush({
        items: { RESEND_API_KEY: item(value) },
        envFileText: `RESEND_API_KEY=${ENCRYPTED}`,
        flyNames: [],
      })
    expect(attempt).toThrow('RESEND_API_KEY')
    expect(attempt).not.toThrow(value)
  })
})

describe('loadFlyItems', () => {
  const roots: string[] = []
  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  const STAGING = [
    'DATABASE_URL=postgresql://app:pw@staging.neon.tech/statuslines?sslmode=require',
    'BETTER_AUTH_URL=https://staging.statuslin.es',
    'BETTER_AUTH_SECRET=staging-secret-0123456789abcdef0123456789',
    'GITHUB_CLIENT_ID=staging-client-id',
    'GITHUB_CLIENT_SECRET=staging-client-secret',
    'GITHUB_TOKEN=staging-github-token',
    'E2B_API_KEY=staging-e2b-key',
    'RESEND_API_KEY=staging-resend-key',
  ]

  /** A checkout with the real schema and dev defaults, a personal .env.local, and a staging file. */
  async function checkout(staging: string[]) {
    const root = await mkdtemp(join(tmpdir(), 'push-secrets-'))
    roots.push(root)
    await cp('.env.schema', join(root, '.env.schema'))
    await cp('.env.development', join(root, '.env.development'))
    await writeFile(
      join(root, '.env.local'),
      'GITHUB_TOKEN=local-github-token\nPOSTHOG_PROJECT_TOKEN=local-posthog-token\n',
    )
    await writeFile(join(root, '.env.staging'), `${staging.join('\n')}\n`)
    return root
  }

  it('reads only the schema and the env file: never .env.local, .env.development or the shell', async () => {
    vi.stubEnv('E2B_API_KEY', 'shell-e2b-key')
    const items = loadFlyItems('staging', await checkout(STAGING))
    expect(items.DATABASE_URL?.value).toBe(
      'postgresql://app:pw@staging.neon.tech/statuslines?sslmode=require',
    )
    expect(items.GITHUB_TOKEN?.value).toBe('staging-github-token')
    expect(items.E2B_API_KEY?.value).toBe('staging-e2b-key')
    expect(items.POSTHOG_PROJECT_TOKEN).toEqual({ isSensitive: false })
    expect(items.BETTER_AUTH_URL).toEqual({
      value: 'https://staging.statuslin.es',
      isSensitive: false,
    })
  })

  it("fails validation when the env file leaves out a required value, instead of using dev's", async () => {
    const root = await checkout(STAGING.filter((line) => !line.startsWith('DATABASE_URL=')))
    expect(() => loadFlyItems('staging', root)).toThrow('.env.staging failed validation')
  })
})
