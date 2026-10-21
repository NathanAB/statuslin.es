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
      'managed settings',
      '--safe-mode',
      'trust dialog',
    ]) {
      expect(STATUS_LINE_FIX_PROMPT, check).toContain(check)
    }
  })

  // The Code tab never runs statusLine, so checking scripts there would end at the wrong advice.
  it('first rules out Claude Desktop, where no script check can help', () => {
    const [step1] = STATUS_LINE_FIX_PROMPT.split('\n2.')
    expect(step1).toContain('Claude Desktop')
    expect(step1).toContain('statuslin.es/guide/claude-desktop')
  })

  it('names the page it follows, and changes nothing until you say yes', () => {
    expect(STATUS_LINE_FIX_PROMPT).toContain('statuslin.es/guide/status-line-not-showing')
    expect(STATUS_LINE_FIX_PROMPT).toContain('Make no changes until I say yes.')
  })
})
