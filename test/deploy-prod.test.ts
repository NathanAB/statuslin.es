import { describe, expect, it } from 'vitest'
import { assertDigestUnchanged, parseStagingDigest } from '../scripts/deploy-prod'

// One machine entry as `fly image show --app X --json` emits it (extra fields trimmed).
const entry = (digest: string, machineId: string) => ({
  Digest: digest,
  MachineID: machineId,
  Registry: 'registry.fly.io',
  Repository: 'statuslines-staging',
  Tag: 'deployment-01ABC',
})

const SHA = `sha256:${'a'.repeat(64)}`

describe('parseStagingDigest', () => {
  it('returns the single digest every machine shares', () => {
    const json = JSON.stringify([entry(SHA, 'm1'), entry(SHA, 'm2'), entry(SHA, 'm3')])
    expect(parseStagingDigest(json)).toBe(SHA)
  })

  it('throws when machines run different images (deploy not settled)', () => {
    const other = `sha256:${'b'.repeat(64)}`
    const json = JSON.stringify([entry(SHA, 'm1'), entry(other, 'm2')])
    expect(() => parseStagingDigest(json)).toThrow(/mixed images/i)
  })

  it('throws when no digest is present', () => {
    expect(() => parseStagingDigest('[]')).toThrow(/no image digest/i)
  })

  it('throws on a malformed digest', () => {
    const json = JSON.stringify([entry('sha256:not-a-real-digest', 'm1')])
    expect(() => parseStagingDigest(json)).toThrow(/unexpected digest/i)
  })
})

describe('assertDigestUnchanged', () => {
  it('passes when staging still runs the digest that was smoked', () => {
    expect(() => assertDigestUnchanged(SHA, SHA)).not.toThrow()
  })

  it('throws when staging was redeployed between smoke and promote', () => {
    const other = `sha256:${'b'.repeat(64)}`
    expect(() => assertDigestUnchanged(SHA, other)).toThrow(/changed during the smoke/i)
  })
})
