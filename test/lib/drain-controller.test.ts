import { describe, expect, it } from 'vitest'
import { createDrainController } from '@/lib/drain-controller'

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
