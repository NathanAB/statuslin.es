import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }))
const recordCopy = vi.hoisted(() => vi.fn())
const recordModCopy = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
const getSession = vi.hoisted(() => vi.fn())

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
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }))
vi.mock('@/adopt/copy', () => ({ recordCopy, findCopiedConfig: async () => null }))
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
  getSession.mockReset().mockResolvedValue(null)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requestCopyIdentity', () => {
  it('keys the client IP into a pseudonym and attributes the copy to it without a browser id', async () => {
    fromClientIp('203.0.113.7')

    expect(await requestCopyIdentity({})).toEqual({
      ipHash: expectedHash('203.0.113.7'),
      distinctId: expectedHash('203.0.113.7'),
      sessionId: undefined,
      signedInUserId: null,
    })
  })

  it("prefers the browser's PostHog ids when it sends them", async () => {
    fromClientIp('203.0.113.7')

    expect(await requestCopyIdentity({ distinctId: 'did', sessionId: 'sid' })).toEqual({
      ipHash: expectedHash('203.0.113.7'),
      distinctId: 'did',
      sessionId: 'sid',
      signedInUserId: null,
    })
  })

  it("names the signed-in user from the request's session", async () => {
    fromClientIp('203.0.113.7')
    getSession.mockResolvedValue({ user: { id: 'u1' } })

    expect((await requestCopyIdentity({ distinctId: 'u1' })).signedInUserId).toBe('u1')
    expect(getSession).toHaveBeenCalledWith({ headers: requestHeaders.current })
  })

  it('treats a failed session lookup as an anonymous copier rather than failing the copy', async () => {
    fromClientIp('203.0.113.7')
    getSession.mockRejectedValue(new Error('db down'))

    expect((await requestCopyIdentity({ distinctId: 'u1' })).signedInUserId).toBeNull()
  })

  it('uses one local bucket outside production when there is no client IP', async () => {
    fromClientIp(null)

    expect((await requestCopyIdentity({})).ipHash).toBe(expectedHash('local-dev'))
  })

  it('counts nothing in production when there is no client IP', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    fromClientIp(null)

    expect(await requestCopyIdentity({})).toEqual({
      ipHash: null,
      distinctId: null,
      sessionId: undefined,
      signedInUserId: null,
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

  it('both skip person processing for an anonymous copier', async () => {
    fromClientIp('198.51.100.4')

    await recordCopyFn({ data: { configId: CONFIG_ID, kind: 'script', distinctId: 'anon' } })
    await recordModCopyFn({ data: { modId: MOD_ID, kind: 'shell', distinctId: 'anon' } })

    expect(capture.mock.calls.map(([event]) => event.properties.$process_person_profile)).toEqual([
      false,
      false,
    ])
  })

  it('both keep person processing for the signed-in copier', async () => {
    fromClientIp('198.51.100.4')
    getSession.mockResolvedValue({ user: { id: 'u1' } })

    await recordCopyFn({ data: { configId: CONFIG_ID, kind: 'script', distinctId: 'u1' } })
    await recordModCopyFn({ data: { modId: MOD_ID, kind: 'shell', distinctId: 'u1' } })

    expect(capture).toHaveBeenCalledTimes(2)
    for (const [event] of capture.mock.calls) {
      expect(event.properties).not.toHaveProperty('$process_person_profile')
    }
  })
})
