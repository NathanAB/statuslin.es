import type { ModFootprint } from '@/db/schema'
import type { AnsiSegment } from '@/render/types'
import type { DesktopPreview } from './queries'

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
  /** A power over the session, its files, programs or network: drawn as a risk on the mod page. */
  risk?: true
}

function literalMatcherValue(value: string | undefined): string | null {
  return value !== undefined && /^[\w-]+$/.test(value) ? value : null
}

/** Plumbing every mod uses: known, so not shown verbatim, but not worth a line. */
const SILENT: EntryMeaning = { phrase: null }

/** Ordered by how much a reader should weigh the entry; phrases are listed in this order. */
const FOOTPRINT_MEANINGS = new Map<string, EntryMeaning>(
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
    '$.mcp.call': { phrase: 'calls MCP tools', risk: true },
    '$.tool.register': { phrase: 'adds a tool Claude can call', risk: true },
    'prompt.compose': { phrase: 'changes the system prompt', risk: true },
    'session.append': {
      phrase: 'sees each message added to the conversation and can change it',
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
    '$.ui.copy': { phrase: 'copies to your clipboard' },
    '$.ui.ask': { phrase: 'asks you questions' },
    '$.audio.play': { phrase: 'plays sounds' },
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
    'agent.spawn': {
      phrase: 'sees each subagent before it starts and can stop it or pick its model',
      risk: true,
    },
    '$.agent.list': { phrase: 'lists running subagents' },
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

/** A footprint entry split into its name and its matcher arguments. */
export function parseEntry(entry: string): { name: string; args: MatcherArgs } {
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
  /** The phrases that name a risk to weigh, in the same order. */
  risks: string[]
  unknown: string[]
  draws: DrawLocation[]
}

/** Whether the validator recorded anything: an empty footprint was never recorded, which is not
 *  the same as a mod that does nothing. */
export function footprintRecorded(footprint: ModFootprint): boolean {
  return footprint.events.length + footprint.calls.length > 0
}

export function describeFootprint(footprint: ModFootprint): FootprintDescription {
  const ranked = new Map<string, number>()
  const risky = new Set<string>()
  const unknown: string[] = []
  const draws = new Set<DrawLocation>()
  for (const entry of [...footprint.events, ...footprint.calls]) {
    const { name, args } = parseEntry(entry)
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
    if (phrase !== null && meaning.risk) risky.add(phrase)
  }
  const phrases = [...ranked].sort((a, b) => a[1] - b[1]).map(([phrase]) => phrase)
  return {
    phrases,
    risks: phrases.filter((phrase) => risky.has(phrase)),
    unknown,
    draws: DRAW_LOCATIONS.filter((location) => draws.has(location)),
  }
}

/** What a version's previews recorded. Only a Desktop result's kind matters here. */
interface RecordedSurfaces {
  preview: AnsiSegment[] | null
  desktop: Pick<DesktopPreview, 'kind'> | null
}

/** The surfaces the recorded previews show it drawing on; one where it drew nothing is left out. */
function modSurfaces(version: RecordedSurfaces): Surface[] {
  const surfaces: Surface[] = []
  if (version.preview !== null && version.preview.length > 0) surfaces.push('terminal')
  if (version.desktop?.kind === 'shot') surfaces.push('desktop')
  return surfaces
}

export interface ModFootprintDescription extends FootprintDescription {
  surfaces: Surface[]
}

/** A version's footprint in plain words, plus the surfaces it renders on. */
export function describeModFootprint(
  version: RecordedSurfaces & { footprint: ModFootprint },
): ModFootprintDescription {
  return { ...describeFootprint(version.footprint), surfaces: modSurfaces(version) }
}
