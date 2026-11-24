import { describe, expect, it } from 'vitest'
import {
  findPalette,
  palettePageCopy,
  palettesWithThemes,
  themeAnchor,
  themesInPalette,
} from '@/themes/palettes'
import type { PublishedTheme } from '@/themes/queries'

const PLUGIN = { id: 'p', slug: 'pack', title: 'Pack', authorGithub: 'octocat', code: null }

function terminal(name: string, key = name.toLowerCase().replace(/\W+/g, '-')): PublishedTheme {
  return {
    id: name,
    key,
    kind: 'terminal',
    name,
    window: 'dark',
    preview: [],
    usesTerminalColors: false,
    plugin: PLUGIN,
  }
}

function desktop(name: string): PublishedTheme {
  const image = { src: '/x.png', width: 1, height: 1 }
  return {
    id: name,
    key: name.toLowerCase(),
    kind: 'desktop',
    name,
    window: 'dark',
    preview: { shot: image, card: image },
    switchSteps: [],
    plugin: PLUGIN,
  }
}

function palette(slug: string) {
  const found = findPalette(slug)
  if (!found) throw new Error(`no palette ${slug}`)
  return found
}

const names = (themes: PublishedTheme[]) => themes.map((theme) => theme.name)

describe('themesInPalette', () => {
  it('files a theme under a palette when its name names the palette, ignoring case and accents, as whole words', () => {
    const themes = [
      terminal('Rosé Pine'),
      desktop('Rose Pine Dawn'),
      terminal('ROSÉ PINE MOON (ANSI)'),
      terminal('Primrose Pineapple'),
      terminal('Nord'),
    ]

    expect(names(themesInPalette(themes, palette('rose-pine')))).toEqual([
      'Rosé Pine',
      'Rose Pine Dawn',
      'ROSÉ PINE MOON (ANSI)',
    ])
  })

  it("files a palette's own variants that carry another name under it", () => {
    const themes = [
      desktop('Alucard'),
      terminal('Dracula'),
      terminal('OneHalf Light'),
      desktop('Atom One Light'),
    ]

    expect(names(themesInPalette(themes, palette('dracula')))).toEqual(['Alucard', 'Dracula'])
    expect(names(themesInPalette(themes, palette('one-dark')))).toEqual([
      'OneHalf Light',
      'Atom One Light',
    ])
  })

  it('keeps Nord apart from words that only start with it', () => {
    expect(
      names(themesInPalette([terminal('Nordic Night'), terminal('Nord Snow')], palette('nord'))),
    ).toEqual(['Nord Snow'])
  })
})

describe('palettesWithThemes', () => {
  it('lists the palettes that have a theme, in the order /themes names them, and none without one', () => {
    const themes = [
      terminal('Nord'),
      desktop('Tokyo Night'),
      terminal('Catppuccin Mocha'),
      terminal('Ember'),
    ]

    expect(palettesWithThemes(themes).map((palette) => palette.slug)).toEqual([
      'catppuccin',
      'tokyo-night',
      'nord',
    ])
  })
})

describe('findPalette', () => {
  it('finds a palette by its slug, and nothing for an unknown one', () => {
    expect(findPalette('tokyo-night')?.name).toBe('Tokyo Night')
    expect(findPalette('ember')).toBeUndefined()
  })
})

describe('palettePageCopy', () => {
  it('names the palette and both places when its themes apply in both', () => {
    const copy = palettePageCopy(palette('catppuccin'), [
      terminal('Catppuccin Mocha'),
      desktop('Catppuccin Latte'),
    ])

    expect(copy).toEqual({
      title: 'Catppuccin Themes for Claude Code and Claude Desktop',
      heading: 'Catppuccin themes for Claude Code and Claude Desktop',
      description:
        '2 Catppuccin themes for the Claude Code terminal and Claude Desktop, each previewed in a real session. Each plugin is reviewed and its install pinned.',
    })
  })

  // A page of Desktop themes never calls them terminal themes.
  it('names only Claude Desktop when every theme is a Desktop theme', () => {
    const copy = palettePageCopy(palette('tokyo-night'), [desktop('Tokyo Night')])

    expect(copy).toEqual({
      title: 'Tokyo Night Themes for Claude Desktop',
      heading: 'Tokyo Night themes for Claude Desktop',
      description:
        '1 Tokyo Night theme for Claude Desktop, previewed in a real session. Each plugin is reviewed and its install pinned.',
    })
  })

  it('names only the terminal when every theme is a terminal theme', () => {
    const copy = palettePageCopy(palette('nord'), [terminal('Nord'), terminal('Nord (ANSI)')])

    expect(copy.title).toBe('Nord Themes for the Claude Code Terminal')
    expect(copy.heading).toBe('Nord themes for the Claude Code terminal')
    expect(copy.description).toBe(
      '2 Nord themes for the Claude Code terminal, each previewed in a real session. Each plugin is reviewed and its install pinned.',
    )
  })
})

describe('themeAnchor', () => {
  // The anchor outlives a re-pin, which gives the theme a new id but keeps its plugin and key.
  it("names a card's anchor by its plugin and key", () => {
    expect(themeAnchor(terminal('Catppuccin Mocha', 'catppuccin-mocha'))).toBe(
      'pack-catppuccin-mocha',
    )
  })
})
