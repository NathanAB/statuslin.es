import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedFile, feedScenario } from '@/render/mods/scenario-feed'
import { FEED_FILE } from '@/render/mods/session'

/** The feed plugin's hooks, driven the way the engine drives them, with a fake `$` beneath. */
type Next = ((e: unknown) => Promise<unknown>) & { origin: { plugin: string } }
type Hook = ($: unknown, e: unknown, next: Next) => Promise<unknown>

const ENGINE_ANSWER = { value: 'the engine answered' }

function fakeEngine(target: string | null) {
  const pending: (() => void)[] = []
  const ticks: (() => void)[] = []
  const $ = {
    fs: {
      read: vi.fn(async (path: string) => {
        if (path !== FEED_FILE) throw new Error(`read ${path}`)
        return JSON.stringify(feedFile(feedScenario(), target, 0))
      }),
    },
    tool: { call: vi.fn(async (_call: unknown) => ({ text: 'ran' })) },
    clock: {
      after: vi.fn((_ms: number, fn: () => void) => pending.push(fn)),
      every: vi.fn((_ms: number, fn: () => void) => {
        ticks.push(fn)
        return { cancel: () => ticks.splice(0) }
      }),
    },
    command: { register: vi.fn(async (_spec: unknown) => undefined) },
    ui: { status: vi.fn((_text: string | undefined) => undefined) },
  }
  const runPending = async () => {
    for (const fn of pending.splice(0)) fn()
    await vi.waitFor(() => expect($.tool.call).toHaveBeenCalledTimes(5))
  }
  return { $, runPending, ticks }
}

function next(plugin: string): Next {
  return Object.assign(
    vi.fn(async () => ENGINE_ANSWER),
    { origin: { plugin } },
  )
}

async function hooks(): Promise<Map<string, { matcher?: unknown; hook: Hook }>> {
  vi.resetModules()
  const { register } = await import('@/render/mods/sandbox/scenario-feed/hooks/register')
  const registered = new Map<string, { matcher?: unknown; hook: Hook }>()
  register((event: string, ...rest: unknown[]) => {
    const hook = rest.at(-1) as Hook
    registered.set(event, rest.length === 2 ? { matcher: rest[0], hook } : { hook })
  })
  return registered
}

async function call(event: string, $: unknown, e: unknown, n: Next): Promise<unknown> {
  const entry = (await hooks()).get(event)
  if (!entry) throw new Error(`no ${event} hook`)
  return entry.hook($, e, n)
}

describe('scenario feed plugin', () => {
  beforeEach(() => vi.restoreAllMocks())

  it.each(['model.complete', 'model.fork', 'agent.list'])(
    "answers the mod under render's %s from the feed",
    async (event) => {
      const { $ } = fakeEngine('ctx-handoff')
      const n = next('ctx-handoff')

      const answered = await call(event, $, {}, n)

      expect(answered).toEqual({ value: feedFile(feedScenario(), 'ctx-handoff', 0).answers[event] })
      expect(n).not.toHaveBeenCalled()
    },
  )

  it.each(['model.complete', 'model.fork', 'agent.list'])(
    "leaves every other plugin's %s to the engine",
    async (event) => {
      const { $ } = fakeEngine('ctx-handoff')
      const n = next('built-in-plugin')

      expect(await call(event, $, { prompt: 'hi' }, n)).toBe(ENGINE_ANSWER)
      expect(n).toHaveBeenCalledWith({ prompt: 'hi' })
    },
  )

  it('answers no plugin in the baseline, which names no target', async () => {
    const { $ } = fakeEngine(null)

    expect(await call('model.complete', $, {}, next('ctx-handoff'))).toBe(ENGINE_ANSWER)
  })

  it('registers /preview-busy at session start, then lets the session start', async () => {
    const { $ } = fakeEngine(null)
    const n = next('scenario-feed')

    expect(await call('session.start', $, { source: 'startup' }, n)).toBe(ENGINE_ANSWER)
    expect($.command.register).toHaveBeenCalledWith({
      name: 'preview-busy',
      description: expect.any(String),
    })
    expect(n).toHaveBeenCalledWith({ source: 'startup' })
  })

  it('lets the session start when /preview-busy cannot be registered', async () => {
    const { $ } = fakeEngine(null)
    $.command.register.mockRejectedValueOnce(new Error('name taken'))
    const n = next('scenario-feed')

    expect(await call('session.start', $, { source: 'startup' }, n)).toBe(ENGINE_ANSWER)
    expect(n).toHaveBeenCalledWith({ source: 'startup' })
  })

  it('answers /preview-busy with no output, then plays the busy calls in order', async () => {
    const { $, runPending } = fakeEngine(null)
    const entry = (await hooks()).get('command.run')

    expect(entry?.matcher).toEqual({ command: 'preview-busy' })
    expect(await entry?.hook($, { command: 'preview-busy', args: '' }, next('x'))).toEqual({
      text: '',
    })
    expect($.tool.call).not.toHaveBeenCalled()
    await runPending()
    expect($.tool.call.mock.calls.map(([made]) => made)).toEqual(
      feedFile(feedScenario(), null, 0).busy,
    )
  })

  it('keeps redrawing its status while the calls run, then clears it', async () => {
    const { $, runPending, ticks } = fakeEngine(null)
    let release = () => {}
    $.tool.call.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ text: 'ran' }))),
    )
    await (await hooks()).get('command.run')?.hook($, {}, next('x'))
    const played = runPending()
    await vi.waitFor(() => expect($.tool.call).toHaveBeenCalledOnce())
    expect(ticks).toHaveLength(1)

    for (const tick of [...ticks, ...ticks]) tick()
    const [first, second] = $.ui.status.mock.calls.map(([text]) => text)
    expect(first).toEqual(expect.any(String))
    expect(second).not.toBe(first)
    expect($.clock.every.mock.calls[0]?.[0]).toBeLessThan(2_000)

    release()
    await played
    await vi.waitFor(() => expect($.ui.status).toHaveBeenLastCalledWith(undefined))
    expect(ticks).toEqual([])
  })

  it('stops redrawing and clears its status when a call fails', async () => {
    const { $, ticks } = fakeEngine(null)
    $.tool.call.mockRejectedValueOnce(new Error("the mod's hook threw"))
    await (await hooks()).get('command.run')?.hook($, {}, next('x'))

    for (const fn of $.clock.after.mock.calls.map(([, fn]) => fn)) fn()

    await vi.waitFor(() => expect($.ui.status).toHaveBeenLastCalledWith(undefined))
    expect(ticks).toEqual([])
  })
})
