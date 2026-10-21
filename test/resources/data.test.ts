import { describe, expect, it } from 'vitest'
import { RESOURCE_SECTIONS } from '@/resources/data'
import { CUSTOMIZATION_SURFACES } from '@/resources/surfaces'

const ALL = RESOURCE_SECTIONS.flatMap((s) => s.resources)

describe('resources data', () => {
  it('has the six sections in display order', () => {
    expect(RESOURCE_SECTIONS.map((s) => s.key)).toEqual([
      'marketplaces',
      'tools',
      'usage-tracking',
      'themes',
      'beyond',
      'guides',
    ])
  })

  // The page opens on every way to customize Claude Code, each backed by Anthropic's own docs.
  it('maps each way to customize Claude Code to its official docs page', () => {
    expect(CUSTOMIZATION_SURFACES.map((s) => s.name)).toEqual([
      'Mods',
      'Status line',
      'Themes',
      'Spinner verbs',
      'Output styles',
      'Hooks',
      'Skills',
      'Subagents',
    ])
    for (const surface of CUSTOMIZATION_SURFACES) {
      expect(surface.docsUrl).toMatch(/^https:\/\/code\.claude\.com\/docs\/en\//)
      expect(surface.text.trim().length).toBeGreaterThan(20)
    }
  })

  it('every entry has a name, an https URL, and a non-empty description', () => {
    expect(ALL.length).toBeGreaterThan(0)
    for (const r of ALL) {
      expect(r.name.trim()).not.toBe('')
      expect(r.url).toMatch(/^https:\/\//)
      expect(r.description.trim().length).toBeGreaterThan(20)
    }
  })

  it('URLs are unique', () => {
    expect(new Set(ALL.map((r) => r.url)).size).toBe(ALL.length)
  })

  it('descriptions spell "status line" as two words in prose', () => {
    // Tool names may spell it one word; descriptions must not, except when quoting
    // a command or tool name (allowed forms: "/statusline", "ccstatusline",
    // "CC-statusline", "claude-statusline", "claude-code-statusline", "statusLine").
    for (const r of ALL) {
      const prose = r.description
        .replaceAll('/statusline', '')
        .replaceAll(/[A-Za-z-]*statusline[A-Za-z-]*/gi, (m) =>
          /^(ccstatusline|CC-statusline|claude-statusline|claude-code-statusline)$/i.test(m)
            ? ''
            : m,
        )
        .replaceAll('statusLine', '')
      expect(prose.toLowerCase()).not.toContain('statusline')
    }
  })

  it('links spinner verbs to their own entry and names every app mods run in', () => {
    const byName = (name: string) => CUSTOMIZATION_SURFACES.find((s) => s.name === name)
    expect(byName('Spinner verbs')?.docsUrl).toBe(
      'https://code.claude.com/docs/en/settings-reference#spinnerverbs',
    )
    expect(byName('Mods')?.text).toMatch(/terminal, Claude Desktop and VS Code/)
  })
})
