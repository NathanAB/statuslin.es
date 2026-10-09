import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }))
const recordCopy = vi.hoisted(() => vi.fn())
const recordModCopy = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: (data: never) => unknown) => ({
      handler: (handler: (args: { data: unknown }) => unknown) => (args: { data: never }) =>
        handler({ data: validator(args.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => requestHeaders.current,
}))
vi.mock('@/db', () => ({ db: { name: 'database' } }))
vi.mock('@/lib/http.server', () => ({ withHttpStatus: (run: () => unknown) => run() }))
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => ({ capture }) }))
vi.mock('@/adopt/copy', () => ({ recordCopy }))
vi.mock('@/mods/queries', () => ({ recordModCopy, getModDetail: vi.fn() }))

const { requestCopyIdentity } = await import('@/lib/copy-identity.server')
const { recordCopyFn } = await import('@/adopt/functions')
const { recordModCopyFn } = await import('@/mods/functions')

const SECRET = 'a-random-test-secret-0123456789abcdef'
const CONFIG_ID = '22222222-2222-4222-8222-222222222222'
const MOD_ID = '11111111-1111-4111-8111-111111111111'

function expectedHash(ip: string): string {
  return createHmac('sha256', SECRET).update(`copy-dedup:${ip}`).digest('hex')
}

function fromClientIp(ip: string | null) {
  requestHeaders.current = new Headers(ip === null ? {} : { 'fly-client-ip': ip })
}

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', SECRET)
  recordCopy.mockReset().mockResolvedValue(1)
  recordModCopy.mockReset().mockResolvedValue(1)
  capture.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requestCopyIdentity', () => {
  it('keys the client IP into a pseudonym and attributes the copy to it without a browser id', () => {
    fromClientIp('203.0.113.7')

    expect(requestCopyIdentity({})).toEqual({
      ipHash: expectedHash('203.0.113.7'),
      distinctId: expectedHash('203.0.113.7'),
      sessionId: undefined,
    })
  })

  it("prefers the browser's PostHog ids when it sends them", () => {
    fromClientIp('203.0.113.7')

    expect(requestCopyIdentity({ distinctId: 'did', sessionId: 'sid' })).toEqual({
      ipHash: expectedHash('203.0.113.7'),
      distinctId: 'did',
      sessionId: 'sid',
    })
  })

  it('uses one local bucket outside production when there is no client IP', () => {
    fromClientIp(null)

    expect(requestCopyIdentity({}).ipHash).toBe(expectedHash('local-dev'))
  })

  it('counts nothing in production when there is no client IP', () => {
    vi.stubEnv('NODE_ENV', 'production')
    fromClientIp(null)

    expect(requestCopyIdentity({})).toEqual({
      ipHash: null,
      distinctId: null,
      sessionId: undefined,
    })
  })
})

describe('config and mod copies', () => {
  it('dedupe one visitor under the same IP hash on both counters', async () => {
    fromClientIp('198.51.100.4')

    await recordCopyFn({ data: { configId: CONFIG_ID, kind: 'script' } })
    await recordModCopyFn({ data: { modId: MOD_ID, kind: 'shell' } })

    const hash = expectedHash('198.51.100.4')
    expect(recordCopy).toHaveBeenCalledWith({ name: 'database' }, CONFIG_ID, hash)
    expect(recordModCopy).toHaveBeenCalledWith({ name: 'database' }, MOD_ID, hash)
    expect(capture.mock.calls.map(([event]) => event.distinctId)).toEqual([hash, hash])
  })

  it('both tie the server event to the browser session', async () => {
    fromClientIp('198.51.100.4')
    const browser = { distinctId: 'did', sessionId: 'sid' }

    await recordCopyFn({ data: { configId: CONFIG_ID, kind: 'script', ...browser } })
    await recordModCopyFn({ data: { modId: MOD_ID, kind: 'shell', ...browser } })

    for (const [event] of capture.mock.calls) {
      expect(event.distinctId).toBe('did')
      expect(event.properties.$session_id).toBe('sid')
    }
    expect(capture).toHaveBeenCalledTimes(2)
  })
})
