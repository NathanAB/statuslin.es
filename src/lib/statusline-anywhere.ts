/**
 * statusline-anywhere: the Claude Code plugin that draws a status line in Claude Desktop's Code
 * tab, which never runs `statusLine` itself. Its README is the source of truth for these facts.
 */
export const STATUSLINE_ANYWHERE_URL = 'https://github.com/NathanAB/statusline-anywhere'

export const STATUSLINE_ANYWHERE_INSTALL_COMMAND =
  'claude plugin marketplace add NathanAB/statusline-anywhere && claude plugin install statusline-anywhere@statusline-anywhere'

export const STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE = '2.1.286'

/** Anthropic's issue asking for status lines in Claude Desktop. */
export const DESKTOP_STATUS_LINE_ISSUE = {
  number: 41456,
  url: 'https://github.com/anthropics/claude-code/issues/41456',
  openedOn: '2026-03-31',
} as const
