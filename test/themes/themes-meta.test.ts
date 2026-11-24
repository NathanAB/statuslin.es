import { createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { THEMES_PATH } from '@/lib/site'
import { Route as ThemesRoute } from '@/routes/themes'
import { routeTree } from '@/routeTree.gen'
import type { PublishedTheme } from '@/themes/queries'
import { THEMES_DESCRIPTION, THEMES_TITLE_BASE } from '@/themes/themes-page'

const ORIGIN = 'https://statuslin.es'

const THEME: PublishedTheme = {
  id: 't1',
  kind: 'terminal',
  name: 'Night',
  window: 'dark',
  preview: [{ text: 'Night screen' }],
  plugin: { id: 'pack-id', slug: 'pack', title: 'Pack', authorGithub: 'octocat', code: null },
}

describe('/themes head', () => {
  const ORIGINAL = process.env.BETTER_AUTH_URL
  afterEach(() => {
    process.env.BETTER_AUTH_URL = ORIGINAL
  })

  function head(themes: PublishedTheme[]) {
    process.env.BETTER_AUTH_URL = ORIGIN
    return ThemesRoute.options.head?.({
      loaderData: { themes, user: null, origin: ORIGIN },
    } as never) as {
      meta: Array<Record<string, string>>
      links: Array<Record<string, string>>
      scripts?: Array<{ type: string; children: string }>
    }
  }

  const jsonLd = (themes: PublishedTheme[]) =>
    (head(themes).scripts ?? []).map((script) => JSON.parse(script.children))

  // Most themes listed are Desktop themes, and people search "Claude Desktop themes" too.
  it('names Claude Code themes and Claude Desktop themes in the title', () => {
    expect(head([THEME]).meta).toContainEqual({
      title: 'Claude Code Themes and Claude Desktop Themes | statuslin.es',
    })
  })

  it('describes the page as a list of each theme plugin page, once, in card order', () => {
    const glow: PublishedTheme = {
      ...THEME,
      id: 't3',
      name: 'Glow',
      plugin: { ...THEME.plugin, id: 'glow-id', slug: 'glow', title: 'Glow' },
    }
    const dawn: PublishedTheme = { ...THEME, id: 't2', name: 'Dawn', window: 'light' }

    expect(jsonLd([THEME, glow, dawn])).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Claude Code Themes and Claude Desktop Themes',
        url: `${ORIGIN}/themes`,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: 2,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Pack', url: `${ORIGIN}/mods/pack` },
            { '@type': 'ListItem', position: 2, name: 'Glow', url: `${ORIGIN}/mods/glow` },
          ],
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: ORIGIN },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Claude Code Themes and Claude Desktop Themes',
            item: `${ORIGIN}/themes`,
          },
        ],
      },
    ])
  })

  it('titles and describes the page and points its canonical link at /themes', () => {
    const { meta, links } = head([THEME])

    expect(meta).toContainEqual({ title: `${THEMES_TITLE_BASE} | statuslin.es` })
    expect(meta).toContainEqual({ name: 'description', content: THEMES_DESCRIPTION })
    expect(links).toContainEqual({ rel: 'canonical', href: `${ORIGIN}/themes` })
    expect(meta.find((tag) => tag.name === 'robots')).toBeUndefined()
  })

  // A shared /themes link unfurls with its own card of theme previews, not the home card.
  it('shares the page with the themes card', () => {
    const { meta } = head([THEME])

    expect(meta).toContainEqual({ property: 'og:image', content: `${ORIGIN}/og/themes.png` })
    expect(meta).toContainEqual({ name: 'twitter:image', content: `${ORIGIN}/og/themes.png` })
  })

  // People search "Claude Code themes": the title leads with it, and both fit what Google shows.
  it('leads the title with the search and keeps the title and description inside what Google shows', () => {
    const { meta } = head([THEME])
    const title = meta.find((tag) => tag.title !== undefined)?.title ?? ''
    const description = meta.find((tag) => tag.name === 'description')?.content ?? ''

    expect(title.startsWith('Claude Code Themes')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(60)
    expect(description.length).toBeGreaterThan(0)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('keeps an empty page out of search results', () => {
    expect(head([]).meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })
})

it('serves /themes from the themes route', () => {
  expect(createRouter({ routeTree }).routesByPath[THEMES_PATH]).toBe(ThemesRoute)
})
