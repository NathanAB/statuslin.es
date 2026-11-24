import type { AnsiSegment } from '@/render/types'

// Claude Code's line for an error in a mod, with the indented rows it wraps onto.
const MOD_ERROR_LINE = /^● \S+: (.*(?:\n {2}\S.*)*)$/gm

// The errors a mod built for Claude Desktop gets in a terminal session: its session.start hook
// threw, or Claude Code refused to load its hooks module because it registers an API that only
// Desktop provides, such as a Desktop theme's `$.theme.set`.
const DESKTOP_ONLY_ERROR =
  /^(?:session\.start hook skipped: |hooks module did not load: .*no loaded plugin provides \$\.\w+\)$)/

/**
 * Whether a terminal recording's only text is Claude Code's error for a mod built for Claude
 * Desktop. Such a mod drew nothing there, and the error is a fact about it, not a preview. A hooks
 * module that failed to load for a reason of its own stays shown.
 */
export function onlyHookError(preview: AnsiSegment[]): boolean {
  const text = preview.map((segment) => segment.text).join('')
  const rest = text.replace(MOD_ERROR_LINE, (line, message: string) =>
    DESKTOP_ONLY_ERROR.test(message.replace(/ ?\n {2}/g, ' ')) ? '' : line,
  )
  return rest !== text && rest.trim() === ''
}
