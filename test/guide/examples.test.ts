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
  STDIN_FIELD_GUIDE,
} from '@/guide/examples'
import { SCENARIOS } from '@/render/scenarios'
import { DOCUMENTED_TOP_LEVEL_FIELDS } from '../helpers/statusline-stdin-fields'

const hasJq = spawnSync('jq', ['--version']).status === 0
// The guide says our tests run MINIMAL_SCRIPT on every pull request, so on CI a missing jq fails
// these tests instead of skipping them. Locally they skip without jq.
const skipWithoutJq = !(hasJq || process.env.CI)

function runScript(stdin: string): string {
  expect(hasJq, 'jq must be installed to run the example script').toBe(true)
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
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(cleanMain.stdin).sort())
    const rl = parsed.rate_limits as { five_hour: { resets_at: number } }
    expect(rl.five_hour.resets_at).toBeGreaterThan(1_700_000_000)
    const cache = parsed.prompt_cache as { expires_at: number }
    expect(cache.expires_at).toBeGreaterThan(1_700_000_000)
  })

  it("the field guide describes every documented top-level field, the sample payload's first and in its order", () => {
    const labels = STDIN_FIELD_GUIDE.map((f) => f.label)
    const sampleKeys = Object.keys(JSON.parse(SAMPLE_STDIN_JSON))
    expect(labels.slice(0, sampleKeys.length)).toEqual(sampleKeys)
    expect([...labels].sort()).toEqual([...DOCUMENTED_TOP_LEVEL_FIELDS].sort())
  })

  it('settings snippet is valid JSON with the documented statusLine shape', () => {
    const parsed = JSON.parse(SETTINGS_SNIPPET) as {
      statusLine: { type: string; command: string }
    }
    expect(parsed.statusLine.type).toBe('command')
    expect(parsed.statusLine.command).toBe('~/.claude/statusline.sh')
  })

  it.skipIf(skipWithoutJq)(
    'the example script produces the documented output for the sample payload',
    () => {
      expect(runScript(SAMPLE_STDIN_JSON)).toBe(MINIMAL_SCRIPT_OUTPUT)
    },
  )

  it.skipIf(skipWithoutJq)(
    'the example script survives a fresh session (null used_percentage)',
    () => {
      const fresh = SCENARIOS.find((s) => s.key === 'fresh-session')
      if (!fresh) throw new Error('fresh-session scenario missing')
      expect(runScript(JSON.stringify(fresh.stdin))).toBe('[Opus 4.8] app · 0% context')
    },
  )
})
