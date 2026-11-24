import type { AnsiSegment } from '@/render/types'

/**
 * What a mod's recorded terminal preview shows. A mod that calls a Claude Desktop API, such as a
 * Desktop theme's `$.theme.set`, throws in a terminal session, and Claude Code prints its hook's
 * error there: the mod drew nothing, and the error is a fact about it, not a preview.
 */
export type TerminalResult =
  | { kind: 'unrecorded' }
  | { kind: 'nothing' }
  | { kind: 'hook-error' }
  | { kind: 'drew'; segments: AnsiSegment[] }

// Claude Code's line for a session.start hook that threw, with the indented rows it wraps onto.
const SESSION_START_HOOK_ERROR = /^● \S+: session\.start hook skipped: .*(?:\n {2}\S.*)*$/gm

/** A recording whose only text is session.start hook errors is a hook error; any other text drew. */
export function terminalResult(preview: AnsiSegment[] | null): TerminalResult {
  if (preview === null) return { kind: 'unrecorded' }
  if (preview.length === 0) return { kind: 'nothing' }
  const text = preview.map((segment) => segment.text).join('')
  const rest = text.replace(SESSION_START_HOOK_ERROR, '')
  if (rest !== text && rest.trim() === '') return { kind: 'hook-error' }
  return { kind: 'drew', segments: preview }
}
