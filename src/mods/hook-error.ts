import type { AnsiSegment } from '@/render/types'

// Claude Code's line for a session.start hook that threw, with the indented rows it wraps onto.
const SESSION_START_HOOK_ERROR = /^● \S+: session\.start hook skipped: .*(?:\n {2}\S.*)*$/gm

/**
 * Whether a terminal recording's only text is Claude Code's error for a session.start hook that
 * threw. A mod that calls a Claude Desktop API, such as a Desktop theme's `$.theme.set`, throws so in
 * a terminal session: it drew nothing there, and the error is a fact about it, not a preview.
 */
export function onlyHookError(preview: AnsiSegment[]): boolean {
  const text = preview.map((segment) => segment.text).join('')
  const rest = text.replace(SESSION_START_HOOK_ERROR, '')
  return rest !== text && rest.trim() === ''
}
