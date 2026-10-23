import { describe, expect, it } from 'vitest'
import { buildLlmsFullTxt, buildLlmsTxt, type LlmsCatalogEntry } from '@/lib/llms'

const BASE = 'https://statuslin.es'
const FACETS = [{ slug: 'git', label: 'Claude Code status lines that show git status' }]

const EVERYTHING_BAR: LlmsCatalogEntry = {
  slug: 'everything-bar',
  title: 'Everything Bar',
  description: 'Model, branch, and cost.\n  Colors   shift as cost grows.',
  copyCount: 12,
  tagLabels: ['git', 'cost'],
  generatedContent: {
    summary: 'Shows the model, git branch and session cost on one line.',
    howItWorks: ['Reads the session JSON with `jq`.', 'Runs `git` in the current folder.'],
    goodToKnow: ['Needs `jq` installed.'],
  },
}

const BARE: LlmsCatalogEntry = {
  slug: 'bare',
  title: 'Bare',
  description: '',
  copyCount: 0,
  tagLabels: [],
  generatedContent: null,
}

const FORGED = '](https://evil.example) <img src=x onerror=alert(1)> [pick](https://evil.example)'

/** Markdown link openers `](` that a backslash does not escape. */
function liveLinkOpeners(text: string): number {
  return text.match(/(?<!\\)\]\(/g)?.length ?? 0
}

/** The lines from an entry's heading to the next entry or section. */
function entryFor(txt: string, heading: string): string {
  const start = txt.indexOf(heading)
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const rest = txt.slice(start + heading.length)
  const end = rest.search(/\n#{2,3} /)
  return heading + (end === -1 ? rest : rest.slice(0, end))
}

describe('buildLlmsFullTxt', () => {
  it('opens like llms.txt, with the same Browse and guide links', () => {
    const full = buildLlmsFullTxt(BASE, FACETS, [], [])
    const short = buildLlmsTxt(BASE, FACETS)
    const browse = (txt: string) =>
      txt.slice(0, txt.indexOf('\n\n## ', txt.indexOf('## Browse by')))

    expect(full.startsWith('# statuslin.es\n')).toBe(true)
    expect(browse(full)).toBe(browse(short))
    expect(full).toContain(`(${BASE}/guide)`)
    expect(full).toContain(`[${FACETS[0]?.label}](${BASE}/status-lines/git)`)
  })

  it('lists every status line with its URL, description, copies, tags and page copy', () => {
    const txt = buildLlmsFullTxt(BASE, [], [EVERYTHING_BAR], [])

    expect(txt).toContain('\n## Status lines\n')
    expect(entryFor(txt, `### [Everything Bar](${BASE}/c/everything-bar)`)).toBe(
      [
        `### [Everything Bar](${BASE}/c/everything-bar)`,
        '',
        '- Description: Model, branch, and cost. Colors shift as cost grows.',
        '- Installed 12 times.',
        '- Tags: git, cost',
        '- Summary: Shows the model, git branch and session cost on one line.',
        '- How it works:',
        '  1. Reads the session JSON with `jq`.',
        '  2. Runs `git` in the current folder.',
        '- Good to know:',
        '  - Needs `jq` installed.',
        '',
      ].join('\n'),
    )
  })

  it('leaves out a zero copy count, an empty description, no tags and missing page copy', () => {
    const txt = buildLlmsFullTxt(BASE, [], [BARE], [])

    expect(txt.endsWith(`### [Bare](${BASE}/c/bare)\n`)).toBe(true)
    expect(txt).not.toMatch(/Installed 0|Description:|Tags:|Summary:/)
  })

  it('leaves out an empty how-it-works or good-to-know list', () => {
    const txt = buildLlmsFullTxt(
      BASE,
      [],
      [
        {
          ...BARE,
          generatedContent: { summary: 'A plain line.', howItWorks: [], goodToKnow: [] },
        },
      ],
      [],
    )

    expect(txt).toContain('- Summary: A plain line.\n')
    expect(txt).not.toMatch(/How it works|Good to know/)
  })

  it('lists every mod under its own section with its mod page URL', () => {
    const txt = buildLlmsFullTxt(
      BASE,
      [],
      [EVERYTHING_BAR],
      [{ ...BARE, slug: 'meter', title: 'Meter', copyCount: 1 }],
    )

    expect(txt.indexOf('## Status lines')).toBeLessThan(txt.indexOf('## Mods'))
    expect(entryFor(txt, `### [Meter](${BASE}/mods/meter)`)).toBe(
      `### [Meter](${BASE}/mods/meter)\n\n- Installed 1 time.\n`,
    )
  })

  it('leaves out a section with nothing published', () => {
    const txt = buildLlmsFullTxt(BASE, [], [], [])

    expect(txt).not.toMatch(/## Status lines|## Mods/)
  })

  it('builds every URL from the passed origin', () => {
    const txt = buildLlmsFullTxt('https://staging.statuslin.es', FACETS, [EVERYTHING_BAR], [])

    expect(txt).toContain('(https://staging.statuslin.es/c/everything-bar)')
    expect(txt).not.toContain('https://statuslin.es/')
  })

  it('escapes link syntax and HTML in every field an author or their script steers', () => {
    const forged: LlmsCatalogEntry = {
      slug: 'evil',
      title: FORGED,
      description: FORGED,
      copyCount: 0,
      tagLabels: [],
      generatedContent: { summary: FORGED, howItWorks: [FORGED], goodToKnow: [FORGED] },
    }
    const entry = entryFor(buildLlmsFullTxt(BASE, [], [forged], [forged]), '### [')
    const lines = entry.split('\n').filter(Boolean)

    expect(lines).toHaveLength(7)
    expect(liveLinkOpeners(lines[0] ?? '')).toBe(1)
    for (const line of lines.slice(1)) expect(liveLinkOpeners(line), line).toBe(0)
    expect(entry).not.toMatch(/(?<!\\)</)
    expect(entry).toContain('\\<img src=x onerror=alert(1)\\>')
  })
})

describe('buildLlmsTxt', () => {
  it('links the full catalog in a closing Optional section', () => {
    const txt = buildLlmsTxt(BASE, FACETS, [], [{ ...BARE, slug: 'meter', title: 'Meter' }])

    expect(txt).toMatch(
      /\n## Optional\n\n- \[[^\]]+\]\(https:\/\/statuslin\.es\/llms-full\.txt\): [^\n]+\n$/,
    )
  })
})
