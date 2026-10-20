import type { ModFootprint } from '@/db/schema'
import { parseEntry } from './footprint'

/**
 * The slash commands a mod adds. `names` are the ones `claude plugin validate` recorded by name;
 * `unnamed` is true when it recorded at least one more whose name it does not give.
 */
export interface FootprintCommands {
  names: string[]
  unnamed: boolean
}

/** The yes/no facts a mod page's tiles state, read from the validator's footprint alone. */
export interface FootprintFacts {
  /** Null when the mod adds no slash command. */
  commands: FootprintCommands | null
  callsModel: boolean
  writesFiles: boolean
  usesNetwork: boolean
  runsPrograms: boolean
}

const COMMAND_NAME = /^[\w:-]+$/

/** The file calls that only read. Any other `$.fs` call counts as a possible write. */
const FILE_READS = new Set(['$.fs.read', '$.fs.list', '$.fs.exists', '$.fs.stat'])

/** A `command.run` handler's names, or null when its matcher is not a list of plain names. */
function handlerNames(args: Record<string, string>): string[] | null {
  const alternatives = args.command?.split('|') ?? []
  const plain = alternatives.length > 0 && alternatives.every((part) => COMMAND_NAME.test(part))
  return plain ? alternatives : null
}

function commandsOf(footprint: ModFootprint): FootprintCommands | null {
  const handlers = footprint.events
    .map(parseEntry)
    .filter((entry) => entry.name === 'command.run')
    .map((entry) => handlerNames(entry.args))
  const names = [...new Set(handlers.flatMap((found) => found ?? []))]
  const unnamed =
    handlers.includes(null) ||
    (handlers.length === 0 && footprint.calls.includes('$.command.register'))
  return names.length > 0 || unnamed ? { names, unnamed } : null
}

/**
 * Runs a Claude Code tool, such as Bash, Edit or Write. The footprint records the call but not which
 * tool it names, so it counts as both running programs and writing files.
 */
const TOOL_CALL = '$.tool.call'

const calls = (footprint: ModFootprint, namespace: string) =>
  footprint.calls.some((call) => call.startsWith(namespace))

export function footprintFacts(footprint: ModFootprint): FootprintFacts {
  const callsTools = footprint.calls.includes(TOOL_CALL)
  return {
    commands: commandsOf(footprint),
    callsModel: calls(footprint, '$.model.'),
    writesFiles:
      callsTools ||
      footprint.calls.some((call) => call.startsWith('$.fs.') && !FILE_READS.has(call)),
    usesNetwork: calls(footprint, '$.http.'),
    runsPrograms: callsTools || calls(footprint, '$.process.'),
  }
}
