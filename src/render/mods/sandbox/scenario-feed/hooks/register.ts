/** Written by the recorder before Claude Code starts: `FeedFile` in src/render/mods/scenario-feed.ts. */
const FEED_FILE = '/home/user/.statuslines/feed.json'
const FEED_PLUGIN = 'scenario-feed'
/** Merged over the engine's own answer, so a requested breakdown still comes back. */
const MERGED = new Set(['session.usage'])

type Usage = { context?: Record<string, unknown> } & Record<string, unknown>
type Feed = { target: string | null; answers: Record<string, unknown> }
type Next = ((e: unknown) => Promise<unknown>) & { origin: { plugin: string } }
type Engine = { fs: { read: (path: string) => Promise<string> } }
type Hook = ($: Engine, e: unknown, next: Next) => Promise<unknown>
type Register = (on: (event: string, hook: Hook) => void) => void

let feed: Feed | undefined

/**
 * Answers only the mod under render: Claude Code's built-in plugins call `$` too, and must get the
 * engine's real answers.
 */
async function answer($: Engine, event: string, e: unknown, next: Next) {
  const plugin = next.origin.plugin
  if (plugin === FEED_PLUGIN) return next(e)
  feed ??= JSON.parse(await $.fs.read(FEED_FILE)) as Feed
  if (plugin !== feed.target || !Object.hasOwn(feed.answers, event)) return next(e)
  if (!MERGED.has(event)) return { value: feed.answers[event] }
  const real = ((await next(e)) as { value?: Usage }).value ?? {}
  const scenario = feed.answers[event] as Usage
  return { value: { ...real, ...scenario, context: { ...real.context, ...scenario.context } } }
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
}
