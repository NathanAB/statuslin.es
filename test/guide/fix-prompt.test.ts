import { describe, expect, it } from 'vitest'
import { STATUS_LINE_FIX_PROMPT } from '@/guide/fix-prompt'

// The troubleshooting page's own checklist, handed to Claude Code to run on the visitor's machine.
describe('STATUS_LINE_FIX_PROMPT', () => {
  it('checks each cause the page names', () => {
    for (const check of [
      '~/.claude/settings.json',
      '.claude/settings.local.json',
      'executable',
      'forward slashes',
      'stdout',
      'exit 0',
      'jq',
      'disableAllHooks',
      'allowManagedHooksOnly',
      'trust dialog',
    ]) {
      expect(STATUS_LINE_FIX_PROMPT, check).toContain(check)
    }
  })

  it('names the page it follows, and changes nothing until you say yes', () => {
    expect(STATUS_LINE_FIX_PROMPT).toContain('statuslin.es/guide/status-line-not-showing')
    expect(STATUS_LINE_FIX_PROMPT).toContain('Make no changes until I say yes.')
  })
})
