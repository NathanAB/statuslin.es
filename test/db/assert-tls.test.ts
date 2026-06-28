import { describe, expect, it } from 'vitest'
import { assertProductionDbTls } from '@/db/assert-tls'

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
