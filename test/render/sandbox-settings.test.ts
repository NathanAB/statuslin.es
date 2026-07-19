import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  E2B_TEMPLATE_ID,
  SANDBOX_ANTHROPIC_USAGE_CERT_PATH,
  SANDBOX_ANTHROPIC_USAGE_KEY_PATH,
  SANDBOX_ANTHROPIC_USAGE_SERVER_DEST,
  SANDBOX_ANTHROPIC_USAGE_SERVER_SRC,
  SANDBOX_CLAUDE_SETTINGS_SRC,
} from '@/render/e2b-template'

// The render sandbox seeds this file as the user's ~/.claude/settings.json so statusline scripts
// that read config out of it (a common pattern — e.g. `jq --argjson cfg "$(cat ~/.claude/
// settings.json)"`) find a realistic, VALID-JSON file instead of nothing. A malformed seed would
// silently break EVERY render (jq --argjson on invalid JSON exits non-zero with no output), which
// is the exact failure this fixture exists to prevent — so its validity is gate-enforced here.
const REPO_ROOT = join(import.meta.dirname, '..', '..')
const settingsPath = join(REPO_ROOT, SANDBOX_CLAUDE_SETTINGS_SRC)

describe('sandbox ~/.claude/settings.json seed fixture', () => {
  const raw = readFileSync(settingsPath, 'utf8')

  it('is strictly valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('is a JSON object covering the fields statuslines commonly read', () => {
    const cfg = JSON.parse(raw) as Record<string, unknown>
    expect(typeof cfg).toBe('object')
    expect(cfg).not.toBeNull()
    // Fields real statuslines look up in settings.json.
    for (const key of ['model', 'effortLevel', 'outputStyle', 'statusLine', 'env', 'permissions']) {
      expect(cfg).toHaveProperty(key)
    }
    const statusLine = cfg.statusLine as Record<string, unknown>
    expect(statusLine.type).toBe('command')
    expect(typeof statusLine.command).toBe('string')
  })
})

describe('sandbox Anthropic usage server template contract', () => {
  it('pins renders to an immutable snapshot identity', () => {
    expect(E2B_TEMPLATE_ID).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/)
    expect(E2B_TEMPLATE_ID).not.toBe('statuslines-render')
  })

  it('points to an existing source asset and root-owned runtime paths', () => {
    expect(existsSync(join(REPO_ROOT, SANDBOX_ANTHROPIC_USAGE_SERVER_SRC))).toBe(true)
    expect(SANDBOX_ANTHROPIC_USAGE_SERVER_DEST).toBe('/opt/statuslines/anthropic-usage/server.py')
    expect(SANDBOX_ANTHROPIC_USAGE_CERT_PATH).toBe('/opt/statuslines/anthropic-usage/server.crt')
    expect(SANDBOX_ANTHROPIC_USAGE_KEY_PATH).toBe('/opt/statuslines/anthropic-usage/server.key')
  })
})
