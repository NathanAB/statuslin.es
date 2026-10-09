import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nitro', () => ({
  definePlugin: (plugin: unknown) => plugin,
}))

const plugin = (await import('@/server/db-tls-plugin')).default as unknown as () => void

const originalNodeEnv = process.env.NODE_ENV
const originalDatabaseUrl = process.env.DATABASE_URL

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  restore('NODE_ENV', originalNodeEnv)
  restore('DATABASE_URL', originalDatabaseUrl)
})

describe('database TLS Nitro plugin', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
  })

  it('throws at startup when the production DATABASE_URL has no encrypting sslmode', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/app'

    expect(() => plugin()).toThrow(/sslmode/i)
  })

  it('starts cleanly when the production DATABASE_URL forces TLS', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@db.internal:5432/app?sslmode=require'

    expect(() => plugin()).not.toThrow()
  })

  it('is a no-op outside production', () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/app'

    expect(() => plugin()).not.toThrow()
  })
})
