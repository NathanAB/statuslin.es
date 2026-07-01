import { describe, expect, it } from 'vitest'
import { configPageTitle, NOT_FOUND_TITLE } from '@/lib/page-title'

describe('configPageTitle', () => {
  it('wraps the config name in the keyword template', () => {
    expect(configPageTitle('Powerline Dracula')).toBe(
      'Powerline Dracula — Claude Code Status Line | statuslin.es',
    )
  })

  it('keeps the not-found title on-brand and two-worded', () => {
    expect(NOT_FOUND_TITLE).toBe('Status line not found — statuslin.es')
  })
})
