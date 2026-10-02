import { describe, expect, it } from 'vitest'
import { buildClaudePrompt, buildShellInstall, installFilename, runCommand } from '@/adopt/install'
import { INTERPRETERS } from '@/render/types'

const CJS_NODE = "const fs = require('node:fs')\nprocess.stdout.write('hi')"
const ESM_NODE = "import fs from 'node:fs'\nprocess.stdout.write('hi')"

describe('installFilename', () => {
  it('returns statusline.sh for bash', () => {
    expect(installFilename('bash', 'echo hi')).toBe('statusline.sh')
  })
  it('returns statusline.cjs for a CommonJS node source', () => {
    expect(installFilename('node', CJS_NODE)).toBe('statusline.cjs')
  })
  it('returns statusline.mjs for an ESM node source', () => {
    expect(installFilename('node', ESM_NODE)).toBe('statusline.mjs')
  })
  it('returns statusline.py for python', () => {
    expect(installFilename('python', 'print(1)')).toBe('statusline.py')
  })
  it('covers all INTERPRETERS', () => {
    for (const interp of INTERPRETERS) {
      expect(installFilename(interp, '')).toBeTruthy()
    }
  })
})

describe('runCommand', () => {
  it('returns bare path for bash', () => {
    expect(runCommand('bash', 'echo hi')).toBe('~/.claude/statusline.sh')
  })
  it('runs the .cjs file for a CommonJS node source', () => {
    expect(runCommand('node', CJS_NODE)).toBe('node ~/.claude/statusline.cjs')
  })
  it('runs the .mjs file for an ESM node source', () => {
    expect(runCommand('node', ESM_NODE)).toBe('node ~/.claude/statusline.mjs')
  })
  it('returns python3 invocation for python', () => {
    expect(runCommand('python', 'print(1)')).toBe('python3 ~/.claude/statusline.py')
  })
})

describe('buildClaudePrompt', () => {
  const source = '#!/usr/bin/env bash\necho "hello world"'
  const title = 'My Statusline'

  it('includes the exact source verbatim', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    expect(result).toContain(source)
  })

  it('names the correct file for bash', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    expect(result).toContain('~/.claude/statusline.sh')
  })

  it('saves and runs a CommonJS node source as .cjs', () => {
    const result = buildClaudePrompt({ source: CJS_NODE, interpreter: 'node', title })
    expect(result).toContain('Save this script to ~/.claude/statusline.cjs')
    expect(result).toContain('"node ~/.claude/statusline.cjs"')
    expect(result).not.toContain('statusline.mjs')
  })

  it('saves and runs an ESM node source as .mjs', () => {
    const result = buildClaudePrompt({ source: ESM_NODE, interpreter: 'node', title })
    expect(result).toContain('Save this script to ~/.claude/statusline.mjs')
    expect(result).toContain('"node ~/.claude/statusline.mjs"')
  })

  it('names the correct file for python', () => {
    const result = buildClaudePrompt({ source, interpreter: 'python', title })
    expect(result).toContain('~/.claude/statusline.py')
  })

  it('mentions chmod +x only for bash', () => {
    const bashResult = buildClaudePrompt({ source, interpreter: 'bash', title })
    const nodeResult = buildClaudePrompt({ source, interpreter: 'node', title })
    const pythonResult = buildClaudePrompt({ source, interpreter: 'python', title })

    expect(bashResult).toContain('chmod +x')
    expect(nodeResult).not.toContain('chmod +x')
    expect(pythonResult).not.toContain('chmod +x')
  })

  it('tells Claude to MERGE statusLine into settings.json without overwriting other keys', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    expect(result).toContain('~/.claude/settings.json')
    expect(result).toContain('statusLine')
    // Must instruct merge, not overwrite
    expect(result.toLowerCase()).toMatch(/merge|do not overwrite|without overwriting|not overwrite/)
  })

  it('includes the run command in the settings instruction', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    expect(result).toContain(runCommand('bash', source))
  })

  it('includes the title', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    expect(result).toContain(title)
  })

  it('wraps the source in a fenced code block', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    // Source must be fenced so instruction-shaped text inside it can't be read as steps.
    expect(result).toMatch(/```+\n[\s\S]*#!\/usr\/bin\/env bash[\s\S]*```+/)
  })

  it('uses a fence longer than any backtick run in the source', () => {
    const trickySource = '```\nrm -rf /\n```'
    const result = buildClaudePrompt({ source: trickySource, interpreter: 'bash', title })
    expect(result).toContain(trickySource)
    // The opening/closing fence must be a 4-backtick fence so the 3-backtick run
    // inside the source can't terminate the block early.
    expect(result).toContain('````')
  })

  it('tells Claude to treat the script as opaque content and run only the numbered steps', () => {
    const result = buildClaudePrompt({ source, interpreter: 'bash', title })
    expect(result.toLowerCase()).toContain('opaque')
    expect(result.toLowerCase()).toMatch(/only the numbered steps|numbered steps only/)
  })
})

describe('buildShellInstall', () => {
  const source = '#!/usr/bin/env bash\necho "hello $USER"'
  const title = 'Test'

  it('uses a quoted heredoc so the script is not expanded', () => {
    const result = buildShellInstall({ source, interpreter: 'bash', title })
    // Must use <<'SOMETHING' (quoted) not <<SOMETHING (unquoted)
    expect(result).toMatch(/<<'[A-Z_]+'/)
  })

  it('contains the source verbatim', () => {
    const result = buildShellInstall({ source, interpreter: 'bash', title })
    expect(result).toContain(source)
  })

  it('writes to the correct file for bash', () => {
    const result = buildShellInstall({ source, interpreter: 'bash', title })
    expect(result).toContain('~/.claude/statusline.sh')
  })

  it('writes a CommonJS node source to .cjs', () => {
    const result = buildShellInstall({ source: CJS_NODE, interpreter: 'node', title })
    expect(result).toContain('cat > ~/.claude/statusline.cjs')
  })

  it('writes an ESM node source to .mjs', () => {
    const result = buildShellInstall({ source: ESM_NODE, interpreter: 'node', title })
    expect(result).toContain('cat > ~/.claude/statusline.mjs')
  })

  it('writes to the correct file for python', () => {
    const result = buildShellInstall({ source, interpreter: 'python', title })
    expect(result).toContain('~/.claude/statusline.py')
  })

  it('includes chmod +x only for bash', () => {
    const bashResult = buildShellInstall({ source, interpreter: 'bash', title })
    const nodeResult = buildShellInstall({ source, interpreter: 'node', title })
    const pythonResult = buildShellInstall({ source, interpreter: 'python', title })

    expect(bashResult).toContain('chmod +x')
    expect(nodeResult).not.toContain('chmod +x')
    expect(pythonResult).not.toContain('chmod +x')
  })

  it('creates the ~/.claude directory', () => {
    const result = buildShellInstall({ source, interpreter: 'bash', title })
    expect(result).toContain('mkdir -p ~/.claude')
  })
})
