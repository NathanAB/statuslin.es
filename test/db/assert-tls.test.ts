import { describe, expect, it } from 'vitest'
import {
  assertEncryptingDatabaseUrl,
  assertProductionDbTls,
  hasEncryptingSslmode,
} from '@/db/assert-tls'

const PROD = 'production'
const DEV = 'development'

describe('assertProductionDbTls', () => {
  it('throws in production when the URL has no sslmode', () => {
    expect(() => assertProductionDbTls('postgresql://u:p@db.internal:5432/app', PROD)).toThrow(
      /sslmode/i,
    )
  })

  it('throws in production when sslmode is a non-encrypting mode (disable)', () => {
    expect(() =>
      assertProductionDbTls('postgresql://u:p@db.internal:5432/app?sslmode=disable', PROD),
    ).toThrow(/sslmode/i)
  })

  it('throws in production when sslmode is a weak mode (prefer)', () => {
    expect(() =>
      assertProductionDbTls('postgresql://u:p@db.internal:5432/app?sslmode=prefer', PROD),
    ).toThrow(/sslmode/i)
  })

  it('passes in production when sslmode=require', () => {
    expect(() =>
      assertProductionDbTls('postgresql://u:p@db.internal:5432/app?sslmode=require', PROD),
    ).not.toThrow()
  })

  it('passes in production with a stronger mode (verify-full)', () => {
    expect(() =>
      assertProductionDbTls('postgresql://u:p@db.internal:5432/app?sslmode=verify-full', PROD),
    ).not.toThrow()
  })

  it('passes in production when sslmode is set among other params', () => {
    expect(() =>
      assertProductionDbTls(
        'postgresql://u:p@host:5432/app?pgbouncer=true&sslmode=require&connect_timeout=10',
        PROD,
      ),
    ).not.toThrow()
  })

  it('does not throw in development even without sslmode (local Postgres, no TLS)', () => {
    expect(() => assertProductionDbTls('postgresql://u:p@localhost:5432/app', DEV)).not.toThrow()
  })

  it('does not throw when nodeEnv is undefined (test / unset)', () => {
    expect(() =>
      assertProductionDbTls('postgresql://u:p@localhost:5432/app', undefined),
    ).not.toThrow()
  })
})

describe('hasEncryptingSslmode', () => {
  it.each(['require', 'verify-ca', 'verify-full'])('is true for encrypting mode %s', (mode) => {
    expect(hasEncryptingSslmode(`postgresql://u:p@host:5432/app?sslmode=${mode}`)).toBe(true)
  })

  it.each(['disable', 'allow', 'prefer'])('is false for non-encrypting mode %s', (mode) => {
    expect(hasEncryptingSslmode(`postgresql://u:p@host:5432/app?sslmode=${mode}`)).toBe(false)
  })

  it('is false when sslmode is absent', () => {
    expect(hasEncryptingSslmode('postgresql://u:p@host:5432/app')).toBe(false)
  })
})

describe('assertEncryptingDatabaseUrl', () => {
  it('names the given label when it throws', () => {
    expect(() =>
      assertEncryptingDatabaseUrl('postgresql://u:p@host:5432/app', 'production DATABASE_URL'),
    ).toThrow(/production DATABASE_URL.*sslmode/i)
  })

  it('reports the offending non-encrypting mode', () => {
    expect(() =>
      assertEncryptingDatabaseUrl(
        'postgresql://u:p@host:5432/app?sslmode=disable',
        'production DATABASE_URL',
      ),
    ).toThrow(/sslmode=disable/i)
  })

  it('passes when the URL forces TLS', () => {
    expect(() =>
      assertEncryptingDatabaseUrl(
        'postgresql://u:p@host:5432/app?sslmode=require',
        'production DATABASE_URL',
      ),
    ).not.toThrow()
  })
})
