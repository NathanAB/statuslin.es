import { describe, expect, it } from 'vitest'
import type { PublishedTheme } from '@/themes/queries'
import { coerceThemeFilter, filterThemes, themeFilterOptions } from '@/themes/theme-filter'

type TerminalTheme = Extract<PublishedTheme, { kind: 'terminal' }>

function theme(name: string, over: Partial<TerminalTheme> = {}): TerminalTheme {
  return {
    id: name,
    key: name,
    name,
    kind: 'terminal',
    window: 'dark',
    preview: [],
    usesTerminalColors: false,
    plugin: { id: 'pack-id', slug: 'pack', title: 'Pack', authorGithub: 'octocat', code: null },
    ...over,
  }
}

const PAPER = theme('Paper', { window: 'light' })
const NIGHT = theme('Night')
const DAWN = theme('Dawn', { window: 'light' })
const REEF: PublishedTheme = {
  ...theme('Reef'),
  kind: 'desktop',
  preview: {
    shot: { src: '/theme-previews/reef/desktop.png?r=1', width: 1100, height: 900 },
    card: { src: '/theme-previews/reef/desktop.png?r=1&image=card', width: 440, height: 360 },
  },
  switchSteps: ['/custom-theme night-reef'],
}
const names = (themes: PublishedTheme[]) => themes.map((t) => t.name)

describe('filterThemes', () => {
  it('keeps only the themes made for the window asked for, in their order', () => {
    const themes = [PAPER, NIGHT, DAWN]

    expect(names(filterThemes(themes, { window: 'light' }))).toEqual(['Paper', 'Dawn'])
    expect(names(filterThemes(themes, { window: 'dark' }))).toEqual(['Night'])
  })

  it('keeps every theme when nothing is asked for', () => {
    expect(names(filterThemes([PAPER, NIGHT], {}))).toEqual(['Paper', 'Night'])
  })

  it('keeps the themes that apply where asked, within the window asked for', () => {
    const themes = [PAPER, NIGHT, DAWN]

    expect(names(filterThemes(themes, { where: 'terminal' }))).toEqual(['Paper', 'Night', 'Dawn'])
    expect(names(filterThemes(themes, { where: 'terminal', window: 'dark' }))).toEqual(['Night'])
  })

  it('keeps only the Desktop themes when Claude Desktop is asked for', () => {
    expect(names(filterThemes([PAPER, REEF, NIGHT], { where: 'desktop' }))).toEqual(['Reef'])
    expect(names(filterThemes([PAPER, REEF, NIGHT], { where: 'terminal' }))).toEqual([
      'Paper',
      'Night',
    ])
  })
})

describe('themeFilterOptions', () => {
  it('offers both windows, light first, when the themes span both', () => {
    expect(themeFilterOptions([NIGHT, PAPER, DAWN]).window).toEqual(['light', 'dark'])
  })

  // A choice of one filters nothing.
  it('offers no window choice when every theme is made for one window', () => {
    expect(themeFilterOptions([NIGHT, theme('Ember')]).window).toBeNull()
    expect(themeFilterOptions([]).window).toBeNull()
  })

  it('offers no choice of where a theme applies while every theme applies in one place', () => {
    expect(themeFilterOptions([PAPER, NIGHT]).where).toBeNull()
  })

  it('offers the terminal and Claude Desktop once both kinds are listed', () => {
    expect(themeFilterOptions([REEF, PAPER]).where).toEqual(['terminal', 'desktop'])
  })
})

describe('coerceThemeFilter', () => {
  it('keeps a window and a place it knows', () => {
    expect(coerceThemeFilter({ window: 'light', where: 'terminal' })).toStrictEqual({
      where: 'terminal',
      window: 'light',
    })
  })

  // An explicit undefined, not a missing key: the router spreads this over the raw URL search, so a
  // missing key would keep the junk, and the server redirects to the URL without it.
  it('drops a value it does not know, as an explicit undefined', () => {
    for (const junk of ['dim', '', 'Dark', ['dark'], 1, '__proto__', 'toString']) {
      expect(coerceThemeFilter({ window: junk, where: junk })).toStrictEqual({
        where: undefined,
        window: undefined,
      })
    }
  })
})
