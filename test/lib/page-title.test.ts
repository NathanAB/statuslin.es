import { describe, expect, it } from 'vitest'
import {
  configPageTitle,
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

  it('keeps the not-found title on-brand and two-worded', () => {
    expect(NOT_FOUND_TITLE).toBe('Status line not found — statuslin.es')
  })

  it('exposes the home title base for the title tag and JSON-LD to share', () => {
    expect(HOME_TITLE_BASE).toBe('Claude Code Status Lines — Community Gallery')
  })
})

describe('static page titles', () => {
  it('state the target keyword', () => {
    expect(GUIDE_TITLE_BASE).toBe('How to Set Up a Claude Code Status Line')
    expect(RESOURCES_TITLE_BASE).toBe('Claude Code Status Line Tools & Resources')
  })
})
