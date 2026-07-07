import { describe, expect, it } from 'vitest'
import { buildLlmsTxt } from '@/lib/llms'

describe('buildLlmsTxt', () => {
  const facets = [
    { slug: 'git', label: 'Claude Code status lines that show git status' },
    { slug: 'token-usage', label: 'Claude Code status lines that show token usage' },
  ]

  it('starts with the H1 title and a blockquote summary', () => {
    const txt = buildLlmsTxt('https://statuslin.es', facets)
    const lines = txt.split('\n')
    expect(lines[0]).toBe('# statuslin.es')
    expect(txt).toMatch(/\n> .+/) // a blockquote summary line
  })

  it('links the core pages with absolute per-environment URLs', () => {
    const txt = buildLlmsTxt('https://statuslin.es', facets)
    expect(txt).toContain('(https://statuslin.es/)') // gallery home
    expect(txt).toContain('(https://statuslin.es/submit)')
    expect(txt).toContain('(https://statuslin.es/resources)')
  })

  it('lists each live facet as a markdown link under a Browse-by-feature section', () => {
    const txt = buildLlmsTxt('https://statuslin.es', facets)
    expect(txt).toMatch(/^## .*feature/im)
    expect(txt).toContain(
      '[Claude Code status lines that show git status](https://statuslin.es/status-lines/git)',
    )
    expect(txt).toContain(
      '[Claude Code status lines that show token usage](https://statuslin.es/status-lines/token-usage)',
    )
  })

  it('respects the passed origin (staging/prod), not a hardcoded domain', () => {
    const txt = buildLlmsTxt('https://staging.statuslin.es', facets)
    expect(txt).toContain('(https://staging.statuslin.es/)')
    expect(txt).toContain('https://staging.statuslin.es/status-lines/git')
    expect(txt).not.toContain('https://statuslin.es/')
  })

  it('omits the Browse-by-feature section when no facets are live', () => {
    const txt = buildLlmsTxt('https://statuslin.es', [])
    expect(txt).not.toMatch(/feature/i)
    // core pages still present
    expect(txt).toContain('(https://statuslin.es/submit)')
  })
})
