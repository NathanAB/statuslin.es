import { describe, expect, it } from 'vitest'
import { buildContentPrompt, type ContentPromptInput } from '@/content/prompt'
import type { RenderedPreview } from '@/render/types'

function preview(scenarioKey: string, rawStdout: string): RenderedPreview {
  return {
    scenarioKey,
    segments: [],
    rawStdout,
    exitCode: 0,
    timedOut: false,
    trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
  }
}

const BASE: ContentPromptInput = {
  title: 'Powerline Dracula',
  description: 'A dracula-themed powerline.',
  interpreter: 'bash',
  source: 'jq -r .model.display_name',
  networkHosts: [],
  readsClaudeToken: false,
  previews: [preview('clean-main', 'main | Opus'), preview('non-git', '~ | Opus')],
}

describe('buildContentPrompt', () => {
  it('includes the script source and interpreter', () => {
    const prompt = buildContentPrompt(BASE)
    expect(prompt).toContain('jq -r .model.display_name')
    expect(prompt).toContain('bash')
  })

  it('includes each rendered preview with its scenario label and stdin JSON', () => {
    const prompt = buildContentPrompt(BASE)
    expect(prompt).toContain('main | Opus')
    expect(prompt).toContain('~ | Opus')
    // Real scenario labels from src/render/scenarios.ts:
    expect(prompt).toContain('Clean repo, everyday Opus session')
    // The stdin JSON is what lets the model tie outputs to inputs:
    expect(prompt).toContain('"current_dir"')
  })

  it('names the declared network hosts when present', () => {
    const prompt = buildContentPrompt({ ...BASE, networkHosts: ['api.anthropic.com'] })
    expect(prompt).toContain('api.anthropic.com')
  })

  it('says network access is off when no hosts are declared', () => {
    expect(buildContentPrompt(BASE)).toMatch(/network access (is )?off/i)
  })

  it('hard-requires observable-only claims and JSON-only output with the exact keys', () => {
    const prompt = buildContentPrompt(BASE)
    expect(prompt).toMatch(/ONLY what you can observe/i)
    expect(prompt).toContain('whatItShows')
    expect(prompt).toContain('requirements')
    expect(prompt).toContain('behaviorNotes')
    expect(prompt).toMatch(/return only a json object/i)
  })

  it('spells the feature "status line" (two words) in the prompt prose', () => {
    expect(buildContentPrompt(BASE)).toContain('status line')
  })

  it('says so when there are no rendered previews', () => {
    const prompt = buildContentPrompt({ ...BASE, previews: [] })
    expect(prompt).toMatch(/no rendered previews/i)
  })
})
