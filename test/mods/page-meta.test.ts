import { describe, expect, it } from 'vitest'
import { modMetaDescription, modPageTitle } from '@/mods/page-meta'

describe('modPageTitle', () => {
  it('names the mod as a Claude Code mod on the brand', () => {
    expect(modPageTitle('File Tree')).toBe('File Tree — Claude Code mod | statuslin.es')
  })

  it('drops the brand before truncating a name that only fits with the keyword', () => {
    expect(modPageTitle('Token Weather Forecast Board')).toBe(
      'Token Weather Forecast Board — Claude Code mod',
    )
  })

  it('normalizes whitespace and truncates a name too long even for the keyword alone', () => {
    expect(
      modPageTitle('A very long mod title that would otherwise\nmake the search result unwieldy'),
    ).toBe('A very long mod title that would… — Claude Code mod')
  })

  it('names the mod as a mod, then the problem from the headline, on the brand when it fits', () => {
    expect(modPageTitle('Cache Tax', 'Warm prompt cache')).toBe(
      'Cache Tax mod: Warm prompt cache | statuslin.es',
    )
  })

  it('drops the brand when the headline title would pass 60 characters', () => {
    expect(modPageTitle('Cache Tax', "Keep Claude Code's prompt cache warm")).toBe(
      "Cache Tax mod: Keep Claude Code's prompt cache warm",
    )
  })

  it('keeps a long name whole and cuts the headline after its last whole phrase that fits', () => {
    const title = modPageTitle(
      'Status Line Anywhere',
      'Your status line drawn in Claude Desktop and in VS',
    )
    expect(title).toBe('Status Line Anywhere mod: Your status line drawn')
    expect(title.length).toBeLessThanOrEqual(60)
  })

  // Holo Damascus's title was cut to "…pearl theme for Claude…".
  it('cuts a headline before a phrase it cannot fit whole, with no ellipsis', () => {
    expect(modPageTitle('Holo Damascus', 'Holographic pearl theme for Claude Desktop')).toBe(
      'Holo Damascus mod: Holographic pearl theme',
    )
    expect(modPageTitle('Horcrux', 'Old diary theme that writes back in Claude Desktop')).toBe(
      'Horcrux mod: Old diary theme that writes back',
    )
  })

  it('cuts a headline at a comma', () => {
    expect(
      modPageTitle('Token Weather', 'Live token forecasting, burn rates, cache hits at a glance'),
    ).toBe('Token Weather mod: Live token forecasting, burn rates')
  })

  it('falls back to the plain mod title when no whole phrase of the headline fits', () => {
    expect(
      modPageTitle(
        'Claudemaxxing Backdrop',
        'Unbelievablyanimatedwordsbackgroundsforclaudedesktop',
      ),
    ).toBe(modPageTitle('Claudemaxxing Backdrop'))
  })

  it('falls back to the plain mod title when the name leaves no room for a headline word', () => {
    const name = 'A Mod Whose Name Runs On Long Enough To Fill The Title'
    expect(modPageTitle(name, 'Keep Claude Code warm')).toBe(modPageTitle(name))
  })

  // A theme plugin runs no code, so it is never called a mod (GLOSSARY.md).
  it('names a theme plugin by its themes, never as a mod', () => {
    expect(modPageTitle('Theme Pack', undefined, { themeOnly: true })).toBe(
      'Theme Pack — Claude Code Themes | statuslin.es',
    )
  })

  it('leads a theme plugin headline title with themes, not mod', () => {
    expect(modPageTitle('Catppuccin', 'Soothing pastel looks', { themeOnly: true })).toBe(
      'Catppuccin themes: Soothing pastel looks | statuslin.es',
    )
  })
})

describe('modMetaDescription', () => {
  it('normalizes whitespace without changing short descriptions', () => {
    expect(
      modMetaDescription({
        title: 'File Tree',
        description: '  A file\ttree\npane.  ',
        copy: null,
      }),
    ).toBe('A file tree pane.')
  })

  it('caps long descriptions at a whole word', () => {
    const description = modMetaDescription({
      title: 'File Tree',
      description: `A mod with ${'useful details '.repeat(30)}`,
      copy: null,
    })

    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).toMatch(/\S…$/)
  })

  it('names the mod for Claude Code, then its page summary without code marks', () => {
    expect(
      modMetaDescription({
        title: 'Cache Tax',
        description: 'The author says this.',
        copy: { summary: 'Keeps the prompt cache warm while you `/afk`.' },
      }),
    ).toBe('Cache Tax for Claude Code: Keeps the prompt cache warm while you /afk.')
  })

  it('caps a summary description at a whole word', () => {
    const description = modMetaDescription({
      title: 'Cache Tax',
      description: '',
      copy: { summary: `Keeps ${'the prompt cache warm '.repeat(9)}` },
    })

    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).toMatch(/^Cache Tax for Claude Code: Keeps the prompt cache warm .*\S…$/)
  })

  it('falls back to a theme description for a theme plugin with none', () => {
    expect(
      modMetaDescription({ title: 'Theme Pack', description: '', copy: null, themeOnly: true }),
    ).toBe(
      "Reviewed Claude Code terminal themes. See each theme's preview, then install them with one copied prompt.",
    )
  })

  it('falls back to a generic mod description when there is none', () => {
    expect(modMetaDescription({ title: 'File Tree', description: '', copy: null })).toBe(
      'A reviewed Claude Code mod. See its preview and what it can touch, then install it with one copied prompt.',
    )
  })
})
