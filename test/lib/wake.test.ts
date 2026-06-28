import { describe, expect, it } from 'vitest'
import {
  createDrainController,
  handleWakeRequest,
  pingWorkerWake,
  startWakeServer,
  WAKE_PATH,
  WAKE_PORT,
  wakeServerHostname,
  workerWakeUrl,
} from '@/lib/wake'

describe('wake config', () => {
  it('binds fly-local-6pn on Fly and 127.0.0.1 locally', () => {
    expect(wakeServerHostname({ FLY_APP_NAME: 'statuslines' })).toBe('fly-local-6pn')
    expect(wakeServerHostname({})).toBe('127.0.0.1')
  })

  it('targets the worker process .internal host on Fly', () => {
    expect(workerWakeUrl({ FLY_APP_NAME: 'statuslines' })).toBe(
      `http://worker.process.statuslines.internal:${WAKE_PORT}${WAKE_PATH}`,
    )
  })

  it('targets localhost when not on Fly', () => {
    expect(workerWakeUrl({})).toBe(`http://127.0.0.1:${WAKE_PORT}${WAKE_PATH}`)
  })
})

/** A drain whose completion you control, so tests can interleave triggers with an in-flight drain. */
function deferredDrain() {
  let resolveCurrent: () => void = () => {}
  let calls = 0
  const drain = () => {
    calls += 1
    return new Promise<void>((resolve) => {
      resolveCurrent = resolve
    })
  }
  return {
    drain,
    calls: () => calls,
    finishCurrent: () => resolveCurrent(),
  }
}

describe('createDrainController', () => {
  it('runs the drain once for a single trigger', async () => {
    const d = deferredDrain()
    const c = createDrainController(d.drain)
    c.trigger()
    expect(d.calls()).toBe(1)
    d.finishCurrent()
    await Promise.resolve()
    expect(d.calls()).toBe(1)
  })

  it('coalesces triggers during an in-flight drain into exactly one re-run', async () => {
    const d = deferredDrain()
    const c = createDrainController(d.drain)
    c.trigger() // starts drain #1
    c.trigger() // in-flight → pending
    c.trigger() // in-flight → still just pending
    expect(d.calls()).toBe(1)
    d.finishCurrent() // drain #1 resolves → one re-run fires
    await Promise.resolve()
    await Promise.resolve()
    expect(d.calls()).toBe(2)
    d.finishCurrent() // drain #2 resolves → nothing pending
    await Promise.resolve()
    await Promise.resolve()
    expect(d.calls()).toBe(2)
  })

  it('reports drain errors and stays usable', async () => {
    const errors: unknown[] = []
    let shouldThrow = true
    const drain = () => (shouldThrow ? Promise.reject(new Error('db down')) : Promise.resolve())
    const c = createDrainController(drain, (e) => errors.push(e))
    c.trigger()
    await Promise.resolve()
    await Promise.resolve()
    expect(errors).toHaveLength(1)
    shouldThrow = false
    c.trigger() // controller not wedged
    await Promise.resolve()
    expect(String(errors[0])).toContain('db down')
  })
})

describe('pingWorkerWake', () => {
  it('POSTs to the given url', async () => {
    const calls: Array<{ url: string; method?: string }> = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const call: { url: string; method?: string } = { url: String(url) }
      if (init?.method) call.method = init.method
      calls.push(call)
      return new Response(null, { status: 202 })
    }) as unknown as typeof fetch
    await pingWorkerWake('http://127.0.0.1:8081/wake', fakeFetch)
    expect(calls).toEqual([{ url: 'http://127.0.0.1:8081/wake', method: 'POST' }])
  })

  it('never rejects when the worker is unreachable', async () => {
    const failingFetch = (() =>
      Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch
    await expect(
      pingWorkerWake('http://127.0.0.1:8081/wake', failingFetch),
    ).resolves.toBeUndefined()
  })
})

describe('handleWakeRequest', () => {
  it('calls onWake and returns 202 for POST /wake', () => {
    let woke = 0
    const res = handleWakeRequest(new Request(`http://x${WAKE_PATH}`, { method: 'POST' }), () => {
      woke += 1
    })
    expect(res.status).toBe(202)
    expect(woke).toBe(1)
  })

  it('ignores other methods and paths with 404', () => {
    let woke = 0
    const get = handleWakeRequest(new Request(`http://x${WAKE_PATH}`), () => {
      woke += 1
    })
    const other = handleWakeRequest(new Request('http://x/nope', { method: 'POST' }), () => {
      woke += 1
    })
    expect(get.status).toBe(404)
    expect(other.status).toBe(404)
    expect(woke).toBe(0)
  })
})

describe('startWakeServer', () => {
  // startWakeServer binds Bun.serve, so this only runs under the bun runtime. The coverage
  // job (`test:cov`) runs under the Node v8 runner where `Bun` is undefined — skip there.
  // The request-routing logic is covered runtime-agnostically by the handleWakeRequest tests.
  it.skipIf(typeof Bun === 'undefined')(
    'triggers onWake over a real socket and returns 202',
    async () => {
      let woke = 0
      const server = startWakeServer({
        hostname: '127.0.0.1',
        port: 0,
        onWake: () => {
          woke += 1
        },
      })
      try {
        const res = await fetch(`http://127.0.0.1:${server.port}${WAKE_PATH}`, { method: 'POST' })
        expect(res.status).toBe(202)
        expect(woke).toBe(1)
      } finally {
        server.stop()
      }
    },
  )
})
