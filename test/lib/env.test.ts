import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertNotProduction, requireStrongSecret } from '@/lib/env'

const NAME = 'TEST_SECRET_VAR'

describe('requireStrongSecret', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env[NAME]
  })

  afterEach(() => {
    if (original === undefined) delete process.env[NAME]
    else process.env[NAME] = original
  })

  it('returns the value when it is at least 32 characters', () => {
    const value = 'a-perfectly-fine-secret-1234567890ab' // 36 chars, mixed
    process.env[NAME] = value
    expect(requireStrongSecret(NAME)).toBe(value)
  })

  it('accepts a 32-character secret (boundary)', () => {
    const value = 'x'.repeat(16) + 'Y'.repeat(16) // 32 chars, two distinct symbols
    process.env[NAME] = value
    expect(requireStrongSecret(NAME)).toBe(value)
  })

  it('throws when the secret is shorter than 32 characters', () => {
    process.env[NAME] = 'tooshort'
    expect(() => requireStrongSecret(NAME)).toThrow(/TEST_SECRET_VAR/)
  })

  it('throws when the secret is one character short of 32 (boundary)', () => {
    process.env[NAME] = 'a'.repeat(31)
    expect(() => requireStrongSecret(NAME)).toThrow()
  })

  it('throws when the variable is missing', () => {
    delete process.env[NAME]
    expect(() => requireStrongSecret(NAME)).toThrow(/Missing required/)
  })

  it('rejects an obvious low-entropy secret (single repeated character)', () => {
    process.env[NAME] = 'a'.repeat(40)
    expect(() => requireStrongSecret(NAME)).toThrow(/low-entropy|weak/i)
  })

  it('rejects an obvious placeholder secret even if long enough', () => {
    process.env[NAME] = 'changeme-changeme-changeme-changeme'
    expect(() => requireStrongSecret(NAME)).toThrow(/low-entropy|weak|placeholder/i)
  })
})

describe('assertNotProduction', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.NODE_ENV
  })

  afterEach(() => {
    if (original === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = original
  })

  it('throws when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertNotProduction('A dev CLI')).toThrow(/must not run in production/i)
  })

  it('includes the caller context in the message', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertNotProduction('seed:gallery')).toThrow(/seed:gallery/)
  })

  it('does nothing in development', () => {
    process.env.NODE_ENV = 'development'
    expect(() => assertNotProduction('A dev CLI')).not.toThrow()
  })

  it('does nothing when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV
    expect(() => assertNotProduction('A dev CLI')).not.toThrow()
  })
})
