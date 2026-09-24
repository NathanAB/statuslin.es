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
    expect(txt).toMatch(/cop(?:y|ied|ies)/i)
    expect(txt).not.toMatch(/upvote/i)
  })

  it('links the core pages with absolute per-environment URLs', () => {
    const txt = buildLlmsTxt('https://statuslin.es', facets)
    expect(txt).toContain('(https://statuslin.es/)') // gallery home
    expect(txt).toMatch(/sorted by trending, newest, or most copied/i)
    expect(txt).toContain('(https://statuslin.es/submit)')
    expect(txt).toContain('(https://statuslin.es/guide)')
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

  it('lists top configs with a one-line summary and copy count', () => {
    const txt = buildLlmsTxt('https://statuslin.es', facets, [
      {
        slug: 'everything-bar',
        title: 'Everything Bar',
        description: 'Model, branch, and cost.\n  Colors   shift as cost grows.',
        copyCount: 12,
      },
      { slug: 'usage-dot-bars', title: 'Usage Dot Bars', description: '', copyCount: 1 },
      { slug: 'dots', title: 'Dots', description: 'Dots per quota window', copyCount: 2 },
    ])
    expect(txt).toMatch(/^## Top status lines/m)
    expect(txt).toContain(
      '- [Everything Bar](https://statuslin.es/c/everything-bar): Model, branch, and cost. Colors shift as cost grows. Copied 12 times.\n',
    )
    expect(txt).toContain(
      '- [Usage Dot Bars](https://statuslin.es/c/usage-dot-bars): Copied 1 time.\n',
    )
    expect(txt).toContain(
      '- [Dots](https://statuslin.es/c/dots): Dots per quota window. Copied 2 times.\n',
    )
  })

  it('trims a long description to one line at a word boundary', () => {
    const long = `${'word '.repeat(40)}end`
    const txt = buildLlmsTxt(
      'https://statuslin.es',
      [],
      [{ slug: 'long', title: 'Long', description: long, copyCount: 0 }],
    )
    expect(txt).toContain(
      `- [Long](https://statuslin.es/c/long): ${'word '.repeat(31).trim()}… Copied 0 times.\n`,
    )
  })

  it('omits the top-configs section when none are passed', () => {
    const txt = buildLlmsTxt('https://statuslin.es', facets)
    expect(txt).not.toMatch(/Top status lines/)
  })
})
