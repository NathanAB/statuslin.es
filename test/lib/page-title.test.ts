import { describe, expect, it } from 'vitest'
import {
  brandedPageTitle,
  configMetaDescription,
  configPageTitle,
  GUIDE_DESCRIPTION,
  GUIDE_TITLE_BASE,
  homeMetaDescription,
  homePageTitle,
  MOD_NOT_FOUND_TITLE,
  modMetaDescription,
  modPageTitle,
  NOT_FOUND_TITLE,
  RESOURCES_TITLE_BASE,
  resourcesTitle,
} from '@/lib/page-title'

describe('configPageTitle', () => {
  it('wraps the config name in the keyword template', () => {
    expect(configPageTitle('Powerline Dracula')).toBe(
      'Powerline Dracula — Claude Code Status Line | statuslin.es',
    )
  })

  it('drops the brand before truncating a name that only fits with the keyword', () => {
    expect(configPageTitle('Fable / All Models Usage')).toBe(
      'Fable / All Models Usage — Claude Code Status Line',
    )
  })

  it('normalizes whitespace and truncates a name too long even for the keyword alone', () => {
    expect(
      configPageTitle(
        'A very long config title that would otherwise make the search result unwieldy\nfor visitors',
      ),
    ).toBe('A very long config title that… — Claude Code Status Line')
  })

  it('keeps the not-found title on-brand and true of any missing page', () => {
    expect(NOT_FOUND_TITLE).toBe('Page not found — statuslin.es')
  })

  it('keeps the rendered home title inside the length Google shows', () => {
    expect(homePageTitle(1).length).toBeLessThanOrEqual(60)
    expect(homePageTitle(20).length).toBeLessThanOrEqual(60)
  })

  it('names both kinds in the home title and description, inside the lengths Google shows', () => {
    expect(homePageTitle(1)).toBe('Claude Code Mods & Status Lines | statuslin.es')
    expect(homeMetaDescription(1, 1)).toMatch(/^Claude Code mods and status lines\b/)
    expect(homeMetaDescription(1, 1).length).toBeLessThanOrEqual(160)
    expect(homeMetaDescription(20, 20).length).toBeLessThanOrEqual(160)
  })
})

describe('static page titles', () => {
  it('state the target keyword', () => {
    expect(GUIDE_TITLE_BASE).toBe('How to Set Up a Claude Code Status Line')
    expect(GUIDE_DESCRIPTION).toMatch(/tested example you can copy/)
  })
})

describe('resourcesTitle', () => {
  const tool = (name: string) => ({ name, url: `https://example.com/${name}`, description: '' })

  it('names the first two status line tools in display order', () => {
    const sections = [
      { key: 'generators', title: 'Generators', resources: [tool('gen-one')] },
      { key: 'tools', title: 'Tools', resources: [tool('alpha'), tool('beta'), tool('gamma')] },
    ]
    expect(resourcesTitle(sections)).toBe('alpha, beta & More Claude Code Tools')
  })

  it("builds today's /resources title from the resource data, within 60 chars", () => {
    expect(RESOURCES_TITLE_BASE).toBe('ccstatusline, claude-powerline & More Claude Code Tools')
    expect(RESOURCES_TITLE_BASE.length).toBeLessThanOrEqual(60)
  })
})

describe('configMetaDescription', () => {
  it('normalizes whitespace without changing short descriptions', () => {
    expect(configMetaDescription('  Render\tpreview.\nCopy it.  ')).toBe('Render preview. Copy it.')
  })

  it('caps long descriptions at a whole word', () => {
    const description = configMetaDescription(
      `A reviewed status line with ${'useful details '.repeat(30)}`,
    )

    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).toMatch(/…$/)
    expect(description).not.toMatch(/\s…$/)
    expect(description).not.toContain('\n')
  })

  it('uses the reviewed status line fallback when the description is blank', () => {
    expect(configMetaDescription('   ')).toBe(
      'A reviewed Claude Code status line. See its preview and source, then copy it in one paste.',
    )
  })
})

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

  it('names the problem from the headline, on the brand when it fits', () => {
    expect(modPageTitle('Cache Tax', 'Warm prompt cache')).toBe(
      'Cache Tax: Warm prompt cache | statuslin.es',
    )
  })

  it('drops the brand when the headline title would pass 60 characters', () => {
    expect(modPageTitle('Cache Tax', "Keep Claude Code's prompt cache warm")).toBe(
      "Cache Tax: Keep Claude Code's prompt cache warm",
    )
  })

  it('keeps a long name whole and shortens the headline to fit 60 characters', () => {
    const title = modPageTitle(
      'Status Line Anywhere',
      'Your status line drawn in Claude Desktop and in VS',
    )
    expect(title).toBe('Status Line Anywhere: Your status line drawn in Claude…')
    expect(title.length).toBeLessThanOrEqual(60)
  })

  it('keeps the not-found title on-brand', () => {
    expect(MOD_NOT_FOUND_TITLE).toBe('Mod not found — statuslin.es')
  })
})

describe('modMetaDescription', () => {
  it('normalizes whitespace without changing short descriptions', () => {
    expect(modMetaDescription('  A file\ttree\npane.  ')).toBe('A file tree pane.')
  })

  it('caps long descriptions at a whole word', () => {
    const description = modMetaDescription(`A mod with ${'useful details '.repeat(30)}`)

    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).toMatch(/\S…$/)
  })

  it('falls back to a generic mod description when there is none', () => {
    expect(modMetaDescription(null)).toBe(
      'A reviewed Claude Code mod. See its preview and what it can touch, then install it with one copied prompt.',
    )
  })
})

describe('brandedPageTitle', () => {
  it('adds the brand when the whole title fits in 60 characters', () => {
    expect(brandedPageTitle('Minimal Claude Code Status Lines & Mods')).toBe(
      'Minimal Claude Code Status Lines & Mods | statuslin.es',
    )
  })

  it('drops the brand, then truncates, to stay within 60 characters', () => {
    expect(brandedPageTitle('Catppuccin, Dracula & Themed Claude Code Status Lines')).toBe(
      'Catppuccin, Dracula & Themed Claude Code Status Lines',
    )
    expect(
      brandedPageTitle('A facet title long enough that it cannot fit even without the brand'),
    ).toBe('A facet title long enough that it cannot fit even without…')
  })
})
