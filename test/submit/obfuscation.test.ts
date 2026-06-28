import { describe, expect, it } from 'vitest'
import { detectObfuscation } from '@/submit/obfuscation'

// A realistic clean bash+jq statusline resembling real submitted scripts.
// This is the critical false-positive guard — it MUST return [].
// The bash $'...' ANSI syntax is expressed via string concatenation to avoid
// a useless-escape lint warning on \$ inside a JS template literal.
const DOLLAR = '$'
const CLEAN_JQ_STATUSLINE =
  `#!/usr/bin/env bash\n` +
  `# Show current Claude Code model and token usage in the statusline\n` +
  `# Reads ~/.claude/projects/**/*.jsonl for the most recent session entry.\n` +
  `\n` +
  `set -euo pipefail\n` +
  `\n` +
  `json=${DOLLAR}(cat ~/.claude/projects/**/*.jsonl 2>/dev/null | tail -1)\n` +
  `if [[ -z "${DOLLAR}json" ]]; then\n` +
  `  echo "no session"\n` +
  `  exit 0\n` +
  `fi\n` +
  `\n` +
  `model=${DOLLAR}(echo "${DOLLAR}json" | jq -r '.model.display_name // "unknown"')\n` +
  `tokens_in=${DOLLAR}(echo "${DOLLAR}json" | jq -r '.usage.input_tokens // 0')\n` +
  `tokens_out=${DOLLAR}(echo "${DOLLAR}json" | jq -r '.usage.output_tokens // 0')\n` +
  `\n` +
  `# Colours via ANSI escape sequences\n` +
  `RESET=${DOLLAR}'\\033[0m'\n` +
  `BOLD=${DOLLAR}'\\033[1m'\n` +
  `CYAN=${DOLLAR}'\\033[36m'\n` +
  `YELLOW=${DOLLAR}'\\033[33m'\n` +
  `\n` +
  `printf "%s%s%s %s%s/%s%s (%s in, %s out)\\n" \\\n` +
  `  "${DOLLAR}{BOLD}${DOLLAR}{CYAN}" "${DOLLAR}{model}" "${DOLLAR}{RESET}" \\\n` +
  `  "${DOLLAR}{YELLOW}" "${DOLLAR}{tokens_in}" "${DOLLAR}{tokens_out}" "${DOLLAR}{RESET}" \\\n` +
  `  "${DOLLAR}{tokens_in}" "${DOLLAR}{tokens_out}"\n`

// A normal short statusline with no suspicious content
const NORMAL_SHORT = `#!/bin/bash
# Simple git branch statusline
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")
echo "branch: $branch"
`

describe('detectObfuscation', () => {
  it('returns [] for a clean bash+jq statusline with ANSI escapes (no false positive)', () => {
    expect(detectObfuscation(CLEAN_JQ_STATUSLINE)).toEqual([])
  })

  it('returns [] for a normal short script', () => {
    expect(detectObfuscation(NORMAL_SHORT)).toEqual([])
  })

  it('flags a 200+ char base64 blob', () => {
    // 240-char run of valid base64 chars (no spaces/newlines)
    const blob = 'A'.repeat(120) + 'B'.repeat(80) + 'c'.repeat(40)
    const source = `#!/bin/bash\necho "${blob}"`
    const reasons = detectObfuscation(source)
    expect(reasons.length).toBeGreaterThan(0)
    expect(
      reasons.some((r) => r.toLowerCase().includes('base64') || r.toLowerCase().includes('blob')),
    ).toBe(true)
  })

  it('flags eval of a base64-decoded string (bash)', () => {
    const source = `#!/bin/bash\neval "$(echo aGVsbG8= | base64 -d)"`
    const reasons = detectObfuscation(source)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some((r) => r.toLowerCase().includes('eval'))).toBe(true)
  })

  it('flags eval of atob (JS-style)', () => {
    const source = `eval(atob('SGVsbG8gV29ybGQ='))`
    const reasons = detectObfuscation(source)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some((r) => r.toLowerCase().includes('eval'))).toBe(true)
  })

  it('flags a single line longer than 500 chars', () => {
    const longLine = 'x'.repeat(501)
    const source = `#!/bin/bash\n${longLine}\necho done`
    const reasons = detectObfuscation(source)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some((r) => r.toLowerCase().includes('line'))).toBe(true)
  })

  it('does NOT flag a line of exactly 500 chars', () => {
    // Use '.' (not in base64/hex alphabet) so only the line-length heuristic
    // is under test here. 500 chars is exactly at the limit, not over.
    const okLine = '.'.repeat(500)
    const source = `#!/bin/bash\n${okLine}\necho done`
    expect(detectObfuscation(source)).toEqual([])
  })

  it('flags a non-printable control character (null byte)', () => {
    const source = `#!/bin/bash\necho "hello\x00world"`
    const reasons = detectObfuscation(source)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some((r) => r.toLowerCase().includes('non-printable'))).toBe(true)
  })

  it('flags a bell character (\\x07)', () => {
    const source = `#!/bin/bash\necho "ding\x07"`
    const reasons = detectObfuscation(source)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some((r) => r.toLowerCase().includes('non-printable'))).toBe(true)
  })

  it('does NOT flag ESC (\\x1b) used in ANSI escape sequences', () => {
    // Raw ESC char as used in real terminal scripts
    const source = `#!/bin/bash\nprintf '\\x1b[32mGreen\\x1b[0m'\necho done`
    expect(detectObfuscation(source)).toEqual([])
  })
})
