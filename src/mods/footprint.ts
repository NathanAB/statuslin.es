import type { ModFootprint } from '@/db/schema'
import type { ModDetail } from './queries'

/** Where a mod's output appears in Claude Code, in display order. */
export const DRAW_LOCATIONS = [
  'above-prompt',
  'under-prompt',
  'pane',
  'status-entry',
  'toast',
  'built-in-rows',
] as const
export type DrawLocation = (typeof DRAW_LOCATIONS)[number]

export const DRAW_LOCATION_LABEL: Record<DrawLocation, string> = {
  'above-prompt': 'above the prompt',
  'under-prompt': 'under the prompt',
  pane: 'a pane',
  'status-entry': 'a status entry',
  toast: 'a toast',
  'built-in-rows': 'built-in rows',
}

export type Surface = 'terminal' | 'desktop'

export const SURFACE_LABEL: Record<Surface, string> = {
  terminal: 'Terminal',
  desktop: 'Claude Desktop',
}

type MatcherArgs = Record<string, string>

interface EntryMeaning {
  phrase: string | null | ((args: MatcherArgs) => string)
  draws?: DrawLocation
}

function literalMatcherValue(value: string | undefined): string | null {
  return value !== undefined && /^[\w-]+$/.test(value) ? value : null
}

/** Plumbing every mod uses: known, so not shown verbatim, but not worth a line. */
const SILENT: EntryMeaning = { phrase: null }

/** Ordered by how much a reader should weigh the entry; phrases are listed in this order. */
const FOOTPRINT_MEANINGS = new Map<string, EntryMeaning>(
  Object.entries({
    '$.process.run': { phrase: 'runs programs' },
    '$.process.spawn': { phrase: 'runs programs' },
    '$.fs.write': { phrase: 'writes files' },
    '$.http.fetch': { phrase: 'contacts the internet' },
    '$.model.complete': { phrase: 'sends requests to the model' },
    '$.mcp.call': { phrase: 'calls MCP tools' },
    '$.tool.register': { phrase: 'adds a tool the model can call' },
    'prompt.compose': { phrase: 'changes the system prompt' },
    'session.append': { phrase: 'adds messages to the conversation' },
    '$.fs.read': { phrase: 'reads files' },
    '$.fs.list': { phrase: 'reads files' },
    '$.fs.exists': { phrase: 'reads files' },
    '$.fs.stat': { phrase: 'reads files' },
    '$.env.get': { phrase: 'reads environment variables' },
    '$.settings.read': { phrase: 'reads your settings' },
    '$.config.list': { phrase: 'reads your settings' },
    'config.set': { phrase: 'watches settings changes' },
    '$.session.messages': { phrase: 'reads the conversation' },
    '$.session.turns': { phrase: 'reads the conversation' },
    'prompt.submit': { phrase: 'reads the prompts you send' },
    'prompt.edit': { phrase: 'reads your prompt as you type' },
    '$.prompt.read': { phrase: 'reads your prompt as you type' },
    'prompt.attachment': { phrase: 'adds context to your prompts' },
    '$.store.get': { phrase: 'remembers data between sessions' },
    '$.store.set': { phrase: 'remembers data between sessions' },
    '$.ui.copy': { phrase: 'copies to your clipboard' },
    '$.ui.ask': { phrase: 'asks you questions' },
    '$.audio.play': { phrase: 'plays sounds' },
    'command.run': {
      phrase: (args) => {
        const name = literalMatcherValue(args.command)
        return name ? `adds the /${name} command` : 'adds slash commands'
      },
    },
    '$.command.run': { phrase: 'runs slash commands' },
    'tool.call': {
      phrase: (args) => {
        const name = literalMatcherValue(args.tool)
        return name ? `watches ${name} tool calls` : 'watches tool calls'
      },
    },
    'agent.spawn': { phrase: 'watches subagents start' },
    '$.agent.list': { phrase: 'lists running subagents' },
    '$.clock.every': { phrase: 'runs on a timer' },
    '$.clock.after': { phrase: 'runs on a timer' },
    'classic.*': { phrase: 'reacts to classic hook events' },
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
    '$.session.surfaces': SILENT,
    '$.ui.resolve': SILENT,
    '$.ui.invalidate': SILENT,
    '$.ui.close': SILENT,
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
  }),
)

const MEANING_RANK = new Map([...FOOTPRINT_MEANINGS.keys()].map((key, i) => [key, i]))

function parseEntry(entry: string): { name: string; args: MatcherArgs } {
  const match = /^([^{]+)(?:\{(.*)\})?$/.exec(entry)
  const name = match?.[1] ?? entry
  const args: MatcherArgs = {}
  for (const pair of match?.[2]?.split(', ') ?? []) {
    const eq = pair.indexOf('=')
    if (eq > 0) args[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return { name, args }
}

function meaningOf(name: string, args: MatcherArgs): { key: string; meaning: EntryMeaning } | null {
  const namespace = name.slice(0, name.lastIndexOf('.'))
  const keys = [
    ...Object.entries(args).map(([k, v]) => `${name}{${k}=${v}}`),
    name,
    `${namespace}.*`,
  ]
  for (const key of keys) {
    const meaning = FOOTPRINT_MEANINGS.get(key)
    if (meaning) return { key, meaning }
  }
  return null
}

export interface FootprintDescription {
  phrases: string[]
  unknown: string[]
  draws: DrawLocation[]
  mentionsDesktop: boolean
}

export function describeFootprint(footprint: ModFootprint): FootprintDescription {
  const ranked = new Map<string, number>()
  const unknown: string[] = []
  const draws = new Set<DrawLocation>()
  let mentionsDesktop = false
  for (const entry of [...footprint.events, ...footprint.calls]) {
    const { name, args } = parseEntry(entry)
    if (args.surface === 'desktop') mentionsDesktop = true
    const found = meaningOf(name, args)
    if (!found) {
      unknown.push(entry)
      continue
    }
    const { key, meaning } = found
    if (meaning.draws) draws.add(meaning.draws)
    const phrase = typeof meaning.phrase === 'function' ? meaning.phrase(args) : meaning.phrase
    const rank = MEANING_RANK.get(key) ?? Number.MAX_SAFE_INTEGER
    if (phrase !== null && !ranked.has(phrase)) ranked.set(phrase, rank)
  }
  return {
    phrases: [...ranked].sort((a, b) => a[1] - b[1]).map(([phrase]) => phrase),
    unknown,
    draws: DRAW_LOCATIONS.filter((location) => draws.has(location)),
    mentionsDesktop,
  }
}

function modSurfaces(
  version: Pick<ModDetail, 'preview' | 'desktopScreenshot'>,
  mentionsDesktop: boolean,
): Surface[] {
  const surfaces: Surface[] = []
  if (version.preview !== null) surfaces.push('terminal')
  if (version.desktopScreenshot !== null || mentionsDesktop) surfaces.push('desktop')
  return surfaces
}

export interface ModFootprintDescription extends FootprintDescription {
  surfaces: Surface[]
}

/** A version's footprint in plain words, plus the surfaces it renders on. */
export function describeModFootprint(
  version: Pick<ModDetail, 'footprint' | 'preview' | 'desktopScreenshot'>,
): ModFootprintDescription {
  const footprint = describeFootprint(version.footprint)
  return { ...footprint, surfaces: modSurfaces(version, footprint.mentionsDesktop) }
}
