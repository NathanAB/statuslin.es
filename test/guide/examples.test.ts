import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MINIMAL_SCRIPT,
  MINIMAL_SCRIPT_OUTPUT,
  SAMPLE_STDIN_JSON,
  SETTINGS_SNIPPET,
} from '@/guide/examples'
import { SCENARIOS } from '@/render/scenarios'

const hasJq = spawnSync('jq', ['--version']).status === 0

function runScript(stdin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'guide-example-'))
  const path = join(dir, 'statusline.sh')
  writeFileSync(path, MINIMAL_SCRIPT)
  const result = spawnSync('bash', [path], { input: stdin, encoding: 'utf8' })
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe('guide examples', () => {
  it('sample stdin is the real clean-main scenario payload (full schema, resolved resets)', () => {
    const parsed = JSON.parse(SAMPLE_STDIN_JSON) as Record<string, unknown>
    const cleanMain = SCENARIOS.find((s) => s.key === 'clean-main')
    if (!cleanMain) throw new Error('clean-main scenario missing')
    // Same keys as the scenario the render pipeline uses — the guide can't drift from
    // what test/render/scenarios.test.ts forces the scenarios to cover.
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(cleanMain.stdin).sort())
    // resets_at offsets were resolved to absolute epochs (an offset would read as 1970).
    const rl = parsed.rate_limits as { five_hour: { resets_at: number } }
    expect(rl.five_hour.resets_at).toBeGreaterThan(1_700_000_000)
  })

  it('settings snippet is valid JSON with the documented statusLine shape', () => {
    const parsed = JSON.parse(SETTINGS_SNIPPET) as {
      statusLine: { type: string; command: string }
    }
    expect(parsed.statusLine.type).toBe('command')
    expect(parsed.statusLine.command).toBe('~/.claude/statusline.sh')
  })

  it.skipIf(!hasJq)(
    'the example script produces the documented output for the sample payload',
    () => {
      expect(runScript(SAMPLE_STDIN_JSON)).toBe(MINIMAL_SCRIPT_OUTPUT)
    },
  )

  it.skipIf(!hasJq)('the example script survives a fresh session (null used_percentage)', () => {
    const fresh = SCENARIOS.find((s) => s.key === 'fresh-session')
    if (!fresh) throw new Error('fresh-session scenario missing')
    expect(runScript(JSON.stringify(fresh.stdin))).toBe('[Opus 4.8] app · 0% context')
  })
})
