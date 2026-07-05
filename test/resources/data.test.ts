import { describe, expect, it } from 'vitest'
import { RESOURCE_SECTIONS } from '@/resources/data'

const ALL = RESOURCE_SECTIONS.flatMap((s) => s.resources)

describe('resources data', () => {
  it('has the five sections in display order', () => {
    expect(RESOURCE_SECTIONS.map((s) => s.key)).toEqual([
      'tools',
      'generators',
      'usage-tracking',
      'guides',
      'community-lists',
    ])
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
})
