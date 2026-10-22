import type { DrawLocation } from './footprint'

/** What each footprint entry (a validator-recorded API call or event) means for a visitor. */
export type MatcherArgs = Record<string, string>

export interface EntryMeaning {
  phrase: string | null | ((args: MatcherArgs) => string)
  draws?: DrawLocation
  /** A power over the session, its files, programs or network: drawn as a risk on the mod page. */
  risk?: true
}

function literalMatcherValue(value: string | undefined): string | null {
  return value !== undefined && /^[\w-]+$/.test(value) ? value : null
}

/** Plumbing every mod uses: known, so not shown verbatim, but not worth a line. */
const SILENT: EntryMeaning = { phrase: null }

/** Ordered by how much a reader should weigh the entry; phrases are listed in this order.
 *  Meanings checked on 2026-10-22 against code.claude.com/docs/en/plugins/mods/reference, /api,
 *  /events and /admin, and the mods types in anthropics/claude-code (mods/types/claude-code.d.ts). */
export const FOOTPRINT_MEANINGS = new Map<string, EntryMeaning>(
  Object.entries({
    '$.process.run': { phrase: 'runs programs', risk: true },
    '$.process.spawn': { phrase: 'runs programs', risk: true },
    '$.tool.call': {
      phrase:
        "runs Claude Code's tools, such as Bash and Edit, which still pass the session's permission check",
      risk: true,
    },
    '$.fs.write': { phrase: 'writes files', risk: true },
    '$.http.fetch': { phrase: 'connects to the internet', risk: true },
    '$.model.complete': {
      phrase: 'sends its own requests to Claude, which uses your plan',
      risk: true,
    },
    '$.model.fork': {
      phrase: 'sends the conversation to Claude with its own requests, which uses your plan',
      risk: true,
    },
    '$.prompt.submit': {
      phrase: 'submits prompts for you, which can be sent as your own words',
      risk: true,
    },
    '$.prompt.fill': {
      phrase: 'puts text in your prompt box, which can replace what you typed',
      risk: true,
    },
    '$.mcp.call': { phrase: 'calls MCP tools', risk: true },
    '$.tool.register': { phrase: 'adds a tool Claude can call', risk: true },
    'prompt.compose': { phrase: 'changes the system prompt', risk: true },
    'session.append': {
      phrase: 'sees each message added to the conversation and can change it',
      risk: true,
    },
    'prompt.context': {
      phrase: 'sees the context sent with your first message, such as CLAUDE.md, and can change it',
      risk: true,
    },
    '$.fs.read': { phrase: 'reads files' },
    '$.fs.list': { phrase: 'reads files' },
    '$.fs.exists': { phrase: 'reads files' },
    '$.fs.stat': { phrase: 'reads files' },
    '$.env.get': { phrase: 'reads environment variables', risk: true },
    '$.settings.read': { phrase: 'reads your settings' },
    '$.config.list': { phrase: 'reads your settings' },
    'config.set': { phrase: 'sees each change to /config and can block or rewrite it', risk: true },
    '$.config.set': { phrase: 'changes your settings in /config', risk: true },
    '$.session.messages': { phrase: 'reads the conversation' },
    '$.session.turns': { phrase: 'reads the conversation' },
    'prompt.submit': { phrase: 'sees each prompt you send and can change or drop it', risk: true },
    'prompt.edit': { phrase: 'reads your prompt as you type' },
    '$.prompt.read': { phrase: 'reads your prompt as you type' },
    'prompt.attachment': {
      phrase: 'can change or remove the reminders Claude Code adds for Claude',
      risk: true,
    },
    '$.store.get': { phrase: 'remembers data between sessions' },
    '$.store.set': { phrase: 'remembers data between sessions' },
    '$.store.delete': { phrase: 'remembers data between sessions' },
    '$.store.keys': { phrase: 'remembers data between sessions' },
    '$.ui.copy': { phrase: 'copies to your clipboard' },
    '$.ui.ask': { phrase: 'asks you questions' },
    '$.audio.play': { phrase: 'plays sounds' },
    'ui.status': { phrase: 'can change or hide the status lines other mods show' },
    'ui.log': { phrase: 'can change or hide the transcript lines other mods add' },
    'command.run': {
      phrase: (args) => {
        const name = literalMatcherValue(args.command)
        return name ? `adds the /${name} command` : 'adds slash commands'
      },
    },
    '$.command.run': { phrase: 'runs slash commands', risk: true },
    'tool.call': {
      phrase: (args) => {
        const name = literalMatcherValue(args.tool)
        return name
          ? `sees each ${name} tool call before it runs and can block or change it`
          : 'sees each tool call before it runs and can block or change it'
      },
      risk: true,
    },
    'tool.check': {
      phrase: (args) => {
        const name = literalMatcherValue(args.tool)
        return name
          ? `can approve or deny each ${name} tool call before Claude Code asks you`
          : 'can approve or deny each tool call before Claude Code asks you'
      },
      risk: true,
    },
    'agent.spawn': {
      phrase: 'sees each subagent before it starts and can stop it or pick its model',
      risk: true,
    },
    'agent.offer': { phrase: 'can hide subagent types from Claude', risk: true },
    '$.agent.list': { phrase: 'lists running subagents' },
    '$.command.list': { phrase: 'lists the slash commands you can run' },
    'engine.create': { phrase: 'adds its own methods for other mods to call' },
    '$.clock.every': { phrase: 'runs on a timer' },
    '$.clock.after': { phrase: 'runs on a timer' },
    'classic.*': { phrase: 'runs on Claude Code hooks, such as session start' },
    'ui.render{component=AbovePrompt}': { phrase: null, draws: 'above-prompt' },
    'ui.render{component=PromptHint}': { phrase: null, draws: 'under-prompt' },
    'ui.render{component=Pane}': { phrase: null, draws: 'pane' },
    'ui.render': { phrase: null, draws: 'built-in-rows' },
    '$.ui.open': { phrase: null, draws: 'pane' },
    '$.ui.status': { phrase: null, draws: 'status-entry' },
    '$.ui.toast': { phrase: null, draws: 'toast' },
    '$.command.register': SILENT,
    '$.clock.now': SILENT,
    '$.clock.sleep': SILENT,
    '$.state.get': SILENT,
    '$.state.set': SILENT,
    '$.session.cwd': SILENT,
    '$.session.id': SILENT,
    '$.session.root': SILENT,
    '$.session.usage': SILENT,
    '$.session.version': SILENT,
    '$.session.model': SILENT,
    '$.session.surfaces': SILENT,
    '$.ui.resolve': SILENT,
    '$.ui.invalidate': SILENT,
    '$.ui.close': SILENT,
    '$.ui.focus': SILENT,
    '$.ui.panes': SILENT,
    '$.ui.blit': SILENT,
    '$.ui.log': SILENT,
    'session.start': SILENT,
    'session.end': SILENT,
    'session.compact': SILENT,
    'session.measure': SILENT,
    'turn.start': SILENT,
    'turn.step': SILENT,
    'turn.complete': SILENT,
    'ui.focus': SILENT,
    'ui.scroll': SILENT,
    'ui.message': SILENT,
    'ui.close': SILENT,
    'ui.press': SILENT,
    'ui.input': SILENT,
    'ui.select': SILENT,
  }),
)
