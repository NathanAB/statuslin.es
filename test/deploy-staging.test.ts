import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildStagingDeployCommand,
  parseFlyImageReference,
  readSourceMapUploadKey,
} from '../scripts/deploy-staging'

const SHA = `sha256:${'a'.repeat(64)}`

const entry = (
  digest: string,
  machineId: string,
  repository = 'statuslines',
  registry = 'registry.fly.io',
) => ({
  Digest: digest,
  MachineID: machineId,
  Registry: registry,
  Repository: repository,
  Tag: 'deployment-01ABC',
})

describe('parseFlyImageReference', () => {
  it('returns the unanimous full production image reference', () => {
    const json = JSON.stringify([entry(SHA, 'm1'), entry(SHA, 'm2')])

    expect(parseFlyImageReference(json, 'production')).toBe(`registry.fly.io/statuslines@${SHA}`)
  })

  it('rejects machines running mixed production images', () => {
    const other = `sha256:${'b'.repeat(64)}`
    const json = JSON.stringify([entry(SHA, 'm1'), entry(other, 'm2')])

    expect(() => parseFlyImageReference(json, 'production')).toThrow(/mixed images/i)
  })

  it.each([
    ['[]', /no image/i],
    [JSON.stringify([entry('latest', 'm1')]), /digest/i],
    [JSON.stringify([entry(SHA, 'm1', '../statuslines')]), /repository/i],
    [JSON.stringify([entry(SHA, 'm1', 'statuslines', 'https://registry.fly.io')]), /registry/i],
  ])('rejects malformed image data', (json, message) => {
    expect(() => parseFlyImageReference(json, 'production')).toThrow(message)
  })
})

describe('buildStagingDeployCommand', () => {
  it('pins PREVIOUS_IMAGE to the exact production image', () => {
    const image = `registry.fly.io/statuslines@${SHA}`

    expect(buildStagingDeployCommand(image)).toEqual([
      'fly',
      'deploy',
      '--config',
      'fly.staging.toml',
      '--build-arg',
      `PREVIOUS_IMAGE=${image}`,
    ])
  })

  it('hands the build the source map upload key as a build secret, never a build arg', () => {
    const image = `registry.fly.io/statuslines@${SHA}`

    expect(buildStagingDeployCommand(image, 'phx_upload_key')).toEqual([
      'fly',
      'deploy',
      '--config',
      'fly.staging.toml',
      '--build-arg',
      `PREVIOUS_IMAGE=${image}`,
      '--build-secret',
      'POSTHOG_API_KEY=phx_upload_key',
    ])
  })
})

const PRODUCTION_ENV_FILE = [
  'DATABASE_URL=postgresql://app:pw@prod.neon.tech/statuslines?sslmode=require',
  'BETTER_AUTH_URL=https://statuslin.es',
  'BETTER_AUTH_SECRET=production-secret-0123456789abcdef01234567',
  'GITHUB_CLIENT_ID=production-client-id',
  'GITHUB_CLIENT_SECRET=production-client-secret',
  'GITHUB_TOKEN=production-token',
  'E2B_API_KEY=production-e2b-key',
  'RESEND_API_KEY=production-resend-key',
  'POSTHOG_PROJECT_TOKEN=phc_production',
]

describe('readSourceMapUploadKey', () => {
  const roots: string[] = []
  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
    roots.length = 0
  })

  async function projectWith(productionLines: string[]): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'deploy-staging-'))
    roots.push(root)
    await cp('.env.schema', join(root, '.env.schema'))
    await writeFile(join(root, '.env.local'), 'POSTHOG_API_KEY=phx_local\n')
    await writeFile(join(root, '.env.production'), `${productionLines.join('\n')}\n`)
    return root
  }

  it('reads the key from .env.production, never .env.local or the shell', async () => {
    const root = await projectWith([...PRODUCTION_ENV_FILE, 'POSTHOG_API_KEY=phx_production'])
    vi.stubEnv('POSTHOG_API_KEY', 'phx_shell')

    expect(readSourceMapUploadKey(root)).toBe('phx_production')
  })

  it('returns nothing when .env.production leaves the key unset', async () => {
    const root = await projectWith(PRODUCTION_ENV_FILE)

    expect(readSourceMapUploadKey(root)).toBeUndefined()
  })
})
