import { createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { Route as PaletteRoute } from '@/routes/themes_.$palette'
import { routeTree } from '@/routeTree.gen'
import { findPalette, type Palette } from '@/themes/palettes'
import type { PublishedTheme, UnreviewedTheme } from '@/themes/queries'

const ORIGIN = 'https://statuslin.es'

const MOCHA: PublishedTheme = {
  id: 't1',
  key: 'catppuccin-mocha',
  kind: 'terminal',
  name: 'Catppuccin Mocha',
  window: 'dark',
  preview: [{ text: 'Mocha screen' }],
  usesTerminalColors: false,
  plugin: {
    id: 'cat-id',
    slug: 'catppuccin',
    title: 'Catppuccin',
    authorGithub: 'octocat',
    code: null,
  },
}

function palette(slug: string): Palette {
  const found = findPalette(slug)
  if (!found) throw new Error(`no palette ${slug}`)
  return found
}

describe('a palette page head', () => {
  const ORIGINAL = process.env.BETTER_AUTH_URL
  afterEach(() => {
    process.env.BETTER_AUTH_URL = ORIGINAL
  })

  function head(themes: PublishedTheme[], unreviewed: UnreviewedTheme[] = []) {
    process.env.BETTER_AUTH_URL = ORIGIN
    const catppuccin = palette('catppuccin')
    return PaletteRoute.options.head?.({
      loaderData: {
        palette: catppuccin,
        themes,
        unreviewed,
        palettes: [catppuccin],
        user: null,
        origin: ORIGIN,
      },
    } as never) as {
      meta: Array<Record<string, string>>
      links: Array<Record<string, string>>
      scripts: Array<{ children: string }>
    }
  }

  it("titles, describes and shares the page by its palette, at the palette's own URL", () => {
    const { meta, links } = head([MOCHA])

    expect(meta).toContainEqual({
      title: 'Catppuccin Themes for the Claude Code Terminal',
    })
    expect(meta).toContainEqual({
      name: 'description',
      content:
        '1 Catppuccin theme for the Claude Code terminal, previewed in a real session. Every install is reviewed and pinned.',
    })
    expect(links).toContainEqual({ rel: 'canonical', href: `${ORIGIN}/themes/catppuccin` })
    expect(meta).toContainEqual({ property: 'og:url', content: `${ORIGIN}/themes/catppuccin` })
    expect(meta).toContainEqual({
      property: 'og:image',
      content: `${ORIGIN}/og/themes/catppuccin.png`,
    })
  })

  // Unreviewed themes (ADR 0014) are on the page but in no count and no JSON-LD list.
  it('counts and lists only the reviewed themes when unreviewed ones share the palette', () => {
    const latte: UnreviewedTheme = {
      id: 'u1',
      key: 'latte',
      kind: 'terminal',
      name: 'Catppuccin Latte',
      window: 'light',
      preview: [{ text: 'Latte screen' }],
      usesTerminalColors: false,
      mod: { owner: 'ada', pluginName: 'looks' },
    }

    const { meta, scripts } = head([MOCHA], [latte])

    expect(meta).toContainEqual({
      name: 'description',
      content:
        '1 Catppuccin theme for the Claude Code terminal, previewed in a real session. Every install is reviewed and pinned.',
    })
    const [list] = scripts.map((script) => JSON.parse(script.children))
    expect(list.mainEntity.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Catppuccin', url: `${ORIGIN}/mods/catppuccin` },
    ])
  })

  it("lists each theme's plugin page and places the page under Themes", () => {
    const [list, crumbs] = head([MOCHA]).scripts.map((script) => JSON.parse(script.children))

    expect(list.mainEntity.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Catppuccin', url: `${ORIGIN}/mods/catppuccin` },
    ])
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: ORIGIN },
      { '@type': 'ListItem', position: 2, name: 'Themes', item: `${ORIGIN}/themes` },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Catppuccin',
        item: `${ORIGIN}/themes/catppuccin`,
      },
    ])
  })
})

it('serves /themes/<palette> from the palette route', () => {
  expect(createRouter({ routeTree }).routesByPath['/themes/$palette']).toBe(PaletteRoute)
})
