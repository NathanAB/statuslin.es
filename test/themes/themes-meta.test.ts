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
  name: 'Night',
  window: 'dark',
  preview: [{ text: 'Night screen' }],
  plugin: { slug: 'pack', title: 'Pack', authorGithub: 'octocat' },
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
    } as never) as { meta: Array<Record<string, string>>; links: Array<Record<string, string>> }
  }

  it('titles and describes the page and points its canonical link at /themes', () => {
    const { meta, links } = head([THEME])

    expect(meta).toContainEqual({ title: `${THEMES_TITLE_BASE} | statuslin.es` })
    expect(meta).toContainEqual({ name: 'description', content: THEMES_DESCRIPTION })
    expect(links).toContainEqual({ rel: 'canonical', href: `${ORIGIN}/themes` })
    expect(meta.find((tag) => tag.name === 'robots')).toBeUndefined()
  })

  it('keeps an empty page out of search results', () => {
    expect(head([]).meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })
})

it('serves /themes from the themes route', () => {
  expect(createRouter({ routeTree }).routesByPath[THEMES_PATH]).toBe(ThemesRoute)
})
