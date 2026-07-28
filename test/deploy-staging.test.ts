import { describe, expect, it } from 'vitest'
import { buildStagingDeployCommand, parseFlyImageReference } from '../scripts/deploy-staging'

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
})
