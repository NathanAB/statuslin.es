import type { Register } from 'claude-code'

const FEED_PATH = '/home/user/.statuslines/feed.json'
const CALLS_PATH = '/home/user/.statuslines/calls.json'
/** The mod under render, by its plugin.json name; the engine's own plugins are never answered. */
const TARGET_PATH = '/home/user/.statuslines/target-plugin'
/** Answered by merging the scenario over the engine's own answer, so a breakdown still comes back. */
const MERGED = new Set(['session.usage'])

type Answers = Record<string, unknown>
type CallRecord = { plugin: string; event: string; answered: boolean }
type Usage = { context?: Record<string, unknown> } & Record<string, unknown>
type Next = ((e: unknown) => Promise<unknown>) & { origin: { plugin: string } }
type Engine = {
  fs: {
    read: (path: string) => Promise<string>
    write: (path: string, text: string) => Promise<void>
  }
}

function merge(real: Usage, scenario: Usage): Usage {
  return { ...real, ...scenario, context: { ...real.context, ...scenario.context } }
}

/**
 * Hooks every call on `$` the host serves (OpEventOf in this build's types), each by its literal
 * name: the engine refuses an `on()` whose event is not a string literal. Not `on('*')`: a
 * wildcard hook also sits in `command.run`, and the engine then credits this plugin in the reply
 * row of the mod's own command ("scenario-feed+<mod>: ...").
 */
let answers: Answers | undefined
let target: string | undefined
const calls = new Map<string, CallRecord>()

async function answer($: Engine, event: string, e: unknown, next: Next) {
  const plugin = next.origin.plugin
  if (plugin === 'engine' || plugin === 'client' || plugin === 'scenario-feed') return next(e)
  answers ??= (JSON.parse(await $.fs.read(FEED_PATH)) as { answers: Answers }).answers
  target ??= (await $.fs.read(TARGET_PATH).catch(() => '')).trim()
  const answered = plugin === target && Object.hasOwn(answers, event)
  const key = `${plugin} ${event}`
  if (!calls.has(key)) {
    calls.set(key, { plugin, event, answered })
    await $.fs.write(CALLS_PATH, JSON.stringify([...calls.values()]))
  }
  if (!answered) return next(e)
  if (!MERGED.has(event)) return { value: answers[event] }
  const real = (await next(e)) as { value?: Usage }
  return { value: merge(real.value ?? {}, answers[event] as Usage) }
}

export const register: Register = (on) => {
  on('model.complete', ($, e, next) => answer($, 'model.complete', e, next))
  on('model.classify', ($, e, next) => answer($, 'model.classify', e, next))
  on('model.fork', ($, e, next) => answer($, 'model.fork', e, next))
  on('audio.play', ($, e, next) => answer($, 'audio.play', e, next))
  on('audio.speak', ($, e, next) => answer($, 'audio.speak', e, next))
  on('mcp.call', ($, e, next) => answer($, 'mcp.call', e, next))
  on('mcp.connect', ($, e, next) => answer($, 'mcp.connect', e, next))
  on('session.cwd', ($, e, next) => answer($, 'session.cwd', e, next))
  on('session.root', ($, e, next) => answer($, 'session.root', e, next))
  on('session.model', ($, e, next) => answer($, 'session.model', e, next))
  on('session.turns', ($, e, next) => answer($, 'session.turns', e, next))
  on('session.id', ($, e, next) => answer($, 'session.id', e, next))
  on('session.messages', ($, e, next) => answer($, 'session.messages', e, next))
  on('session.repo', ($, e, next) => answer($, 'session.repo', e, next))
  on('session.surface', ($, e, next) => answer($, 'session.surface', e, next))
  on('session.surfaces', ($, e, next) => answer($, 'session.surfaces', e, next))
  on('session.authorize', ($, e, next) => answer($, 'session.authorize', e, next))
  on('session.usage', ($, e, next) => answer($, 'session.usage', e, next))
  on('session.version', ($, e, next) => answer($, 'session.version', e, next))
  on('turn.abort', ($, e, next) => answer($, 'turn.abort', e, next))
  on('prompt.read', ($, e, next) => answer($, 'prompt.read', e, next))
  on('tool.list', ($, e, next) => answer($, 'tool.list', e, next))
  on('tool.register', ($, e, next) => answer($, 'tool.register', e, next))
  on('command.list', ($, e, next) => answer($, 'command.list', e, next))
  on('command.register', ($, e, next) => answer($, 'command.register', e, next))
  on('config.list', ($, e, next) => answer($, 'config.list', e, next))
  on('agent.list', ($, e, next) => answer($, 'agent.list', e, next))
  on('agent.register', ($, e, next) => answer($, 'agent.register', e, next))
  on('ui.toast', ($, e, next) => answer($, 'ui.toast', e, next))
  on('ui.status', ($, e, next) => answer($, 'ui.status', e, next))
  on('ui.log', ($, e, next) => answer($, 'ui.log', e, next))
  on('ui.notice', ($, e, next) => answer($, 'ui.notice', e, next))
  on('ui.invalidate', ($, e, next) => answer($, 'ui.invalidate', e, next))
  on('ui.open', ($, e, next) => answer($, 'ui.open', e, next))
  on('ui.close', ($, e, next) => answer($, 'ui.close', e, next))
  on('ui.panes', ($, e, next) => answer($, 'ui.panes', e, next))
  on('ui.selection', ($, e, next) => answer($, 'ui.selection', e, next))
  on('ui.copy', ($, e, next) => answer($, 'ui.copy', e, next))
  on('ui.blit', ($, e, next) => answer($, 'ui.blit', e, next))
  on('fs.read', ($, e, next) => answer($, 'fs.read', e, next))
  on('fs.write', ($, e, next) => answer($, 'fs.write', e, next))
  on('fs.list', ($, e, next) => answer($, 'fs.list', e, next))
  on('fs.exists', ($, e, next) => answer($, 'fs.exists', e, next))
  on('fs.stat', ($, e, next) => answer($, 'fs.stat', e, next))
  on('fs.ancestors', ($, e, next) => answer($, 'fs.ancestors', e, next))
  on('store.get', ($, e, next) => answer($, 'store.get', e, next))
  on('store.set', ($, e, next) => answer($, 'store.set', e, next))
  on('store.delete', ($, e, next) => answer($, 'store.delete', e, next))
  on('store.keys', ($, e, next) => answer($, 'store.keys', e, next))
  on('state.get', ($, e, next) => answer($, 'state.get', e, next))
  on('state.set', ($, e, next) => answer($, 'state.set', e, next))
  on('clock.now', ($, e, next) => answer($, 'clock.now', e, next))
  on('clock.sleep', ($, e, next) => answer($, 'clock.sleep', e, next))
  on('clock.after', ($, e, next) => answer($, 'clock.after', e, next))
  on('clock.every', ($, e, next) => answer($, 'clock.every', e, next))
  on('http.fetch', ($, e, next) => answer($, 'http.fetch', e, next))
  on('process.run', ($, e, next) => answer($, 'process.run', e, next))
  on('settings.read', ($, e, next) => answer($, 'settings.read', e, next))
  on('env.get', ($, e, next) => answer($, 'env.get', e, next))
  on('env.set', ($, e, next) => answer($, 'env.set', e, next))
}
