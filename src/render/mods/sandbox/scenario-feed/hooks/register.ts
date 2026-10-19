/** Written by the recorder before Claude Code starts: `FeedFile` in src/render/mods/scenario-feed.ts. */
const FEED_FILE = '/home/user/.statuslines/feed.json'
const FEED_PLUGIN = 'scenario-feed'
/** Merged over the engine's own answer, so a requested breakdown still comes back. */
const MERGED = new Set(['session.usage'])
/** Well inside the terminal recorder's 2 s of quiet (`SESSION_TIMING` in recorder.ts). */
const TICK_MS = 500

type Usage = { context?: Record<string, unknown> } & Record<string, unknown>
type Feed = { target: string | null; answers: Record<string, unknown>; busy: unknown[] }
type Next = ((e: unknown) => Promise<unknown>) & { origin: { plugin: string } }
type Engine = {
  fs: { read: (path: string) => Promise<string> }
  tool: { call: (call: never) => Promise<unknown> }
  clock: {
    after: (ms: number, fn: () => void) => unknown
    every: (ms: number, fn: () => void) => { cancel: () => void }
  }
  command: { register: (spec: { name: string; description: string }) => Promise<unknown> }
  ui: { status: (text: string | undefined) => void }
}
type Hook = ($: Engine, e: unknown, next: Next) => Promise<unknown>
type On = {
  (event: string, hook: Hook): void
  (event: string, matcher: { command: string }, hook: Hook): void
}
type Register = (on: On) => void

let feed: Feed | undefined

async function readFeed($: Engine): Promise<Feed> {
  feed ??= JSON.parse(await $.fs.read(FEED_FILE)) as Feed
  return feed
}

/**
 * Answers only the mod under render: Claude Code's built-in plugins call `$` too, and must get the
 * engine's real answers.
 */
async function answer($: Engine, event: string, e: unknown, next: Next) {
  const plugin = next.origin.plugin
  if (plugin === FEED_PLUGIN) return next(e)
  const { target, answers } = await readFeed($)
  if (plugin !== target || !Object.hasOwn(answers, event)) return next(e)
  if (!MERGED.has(event)) return { value: answers[event] }
  const real = ((await next(e)) as { value?: Usage }).value ?? {}
  const scenario = answers[event] as Usage
  return { value: { ...real, ...scenario, context: { ...real.context, ...scenario.context } } }
}

/**
 * One call at a time, as Claude would make them; each runs through the mod's `tool.call` hooks.
 * The calls draw nothing, and the terminal recorder takes its frame after 2 s of quiet, so a
 * status ticks until the last call returns, then clears: the frame comes after the whole session.
 */
async function playBusy($: Engine) {
  let tick = 0
  const ticking = $.clock.every(TICK_MS, () => {
    tick += 1
    $.ui.status(`preview ${'.'.repeat(tick % 4)}`)
  })
  try {
    for (const call of (await readFeed($)).busy) await $.tool.call(call as never)
  } finally {
    ticking.cancel()
    $.ui.status(undefined)
  }
}

/**
 * Each event by its literal name, because the engine refuses an `on()` whose event is not a
 * string literal. Never a wildcard hook: it also sits in `command.run`, and the engine then
 * credits this plugin in the mod's own command reply.
 */
export const register: Register = (on) => {
  on('session.usage', ($, e, next) => answer($, 'session.usage', e, next))
  on('session.model', ($, e, next) => answer($, 'session.model', e, next))
  on('session.cwd', ($, e, next) => answer($, 'session.cwd', e, next))
  on('session.root', ($, e, next) => answer($, 'session.root', e, next))
  on('session.id', ($, e, next) => answer($, 'session.id', e, next))
  on('session.repo', ($, e, next) => answer($, 'session.repo', e, next))
  on('session.version', ($, e, next) => answer($, 'session.version', e, next))
  // Registered in the baseline too, so both sessions type the same steps.
  on('session.start', async ($, e, next) => {
    // A failed registration must not keep the mod's own session.start from running.
    await $.command
      .register({
        name: 'preview-busy',
        description: 'Plays a short busy session for the statuslin.es preview.',
      })
      .catch(() => undefined)
    return next(e)
  })
  // An empty text draws one bare reply row; no text at all draws nothing, but leaves no transcript
  // line either, and Desktop's recorder waits on one to know a step was sent. The calls draw no
  // rows of their own, and run once the command has answered.
  on('command.run', { command: 'preview-busy' }, async ($) => {
    $.clock.after(0, () => {
      // A mod's hook may throw mid-sequence; the frame then shows where the sequence stopped.
      playBusy($).catch(() => undefined)
    })
    return { text: '' }
  })
}
