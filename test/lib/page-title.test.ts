import { describe, expect, it } from 'vitest'
import {
  configMetaDescription,
  configPageTitle,
  GUIDE_DESCRIPTION,
  GUIDE_TITLE_BASE,
  HOME_TITLE_BASE,
  NOT_FOUND_TITLE,
  RESOURCES_TITLE_BASE,
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

  it('keeps the not-found title on-brand and two-worded', () => {
    expect(NOT_FOUND_TITLE).toBe('Status line not found — statuslin.es')
  })

  it('exposes the home title base for the title tag and JSON-LD to share', () => {
    expect(HOME_TITLE_BASE).toBe('Claude Code Status Lines')
  })

  it('keeps the rendered home title inside the length Google shows', () => {
    expect(`${HOME_TITLE_BASE} | statuslin.es`.length).toBeLessThanOrEqual(60)
  })
})

describe('static page titles', () => {
  it('state the target keyword', () => {
    expect(RESOURCES_TITLE_BASE).toBe('Claude Code Status Line Tools & Resources')
    expect(GUIDE_TITLE_BASE).toBe('How to Set Up a Claude Code Status Line')
    expect(GUIDE_DESCRIPTION).toMatch(/tested example you can copy/)
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
      'A reviewed Claude Code status line — rendered preview, source, and one-paste install.',
    )
  })
})
