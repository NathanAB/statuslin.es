import { afterEach, describe, expect, it } from 'vitest'
import {
  configMetaDescription,
  HOME_DESCRIPTION_BASE,
  HOME_TITLE_BASE,
  homeMetaDescription,
  homePageName,
} from '@/lib/page-title'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import {
  configSocialMeta,
  homeSocialMeta,
  modSocialMeta,
  rootSocialMeta,
  staticPageSocialMeta,
  themesSocialMeta,
} from '@/og/meta'

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
})

describe('social meta', () => {
  it('root emits an absolute home og:image and the summary_large_image card', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const meta = rootSocialMeta()
    expect(meta).toContainEqual({
      property: 'og:image',
      content: 'https://statuslin.es/og/home.png?v=2',
    })
    expect(meta).toContainEqual({
      name: 'twitter:image',
      content: 'https://statuslin.es/og/home.png?v=2',
    })
    expect(meta).toContainEqual({ property: 'og:url', content: 'https://statuslin.es' })
    expect(meta).toContainEqual({ property: 'og:title', content: HOME_TITLE_BASE })
    expect(meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' })
    const description = meta.find((entry) => entry.property === 'og:description')?.content
    expect(description).toMatch(/cop(?:y|ied|ies)/i)
    expect(description).toMatch(/^Claude Code mods\b/)
    const pageDescription = meta.find((entry) => entry.name === 'description')?.content
    expect(pageDescription).toMatch(/^Claude Code mods\b/)
    expect(description).toBe(HOME_DESCRIPTION_BASE)
    expect(description).not.toMatch(/curat|pick|chose|behalf/i)
    expect(description).not.toMatch(/upvote/i)
  })
  it('root names the site in og:site_name, and no page overrides it', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    expect(rootSocialMeta()).toContainEqual({ property: 'og:site_name', content: 'statuslin.es' })
    // A status line page's share tags carry no og:site_name of their own, so the root's stands.
    const statusLinePage = configSocialMeta({
      slug: 'my-line',
      title: 'My Line',
      description: 'hi',
    })
    const modPage = modSocialMeta('https://statuslin.es', {
      slug: 'filetree',
      title: 'File Tree',
      description: '',
      generatedContent: null,
      themeOnly: false,
      themeCounts: { desktop: 0, terminal: 0 },
    })
    for (const meta of [statusLinePage, modPage]) {
      expect(meta.some((m) => m.property === 'og:site_name')).toBe(false)
    }
  })
  it('home shares its canonical url with the page name and description', () => {
    const meta = homeSocialMeta({ url: 'https://statuslin.es/?page=2', page: 2, pageCount: 5 })
    expect(meta).toEqual([
      { property: 'og:url', content: 'https://statuslin.es/?page=2' },
      { property: 'og:title', content: homePageName(2) },
      { property: 'og:description', content: homeMetaDescription(2, 5) },
    ])
  })
  it('config emits a per-slug og:image', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const meta = configSocialMeta({ slug: 'my-line', title: 'My Line', description: 'hi' })
    expect(meta).toContainEqual({
      property: 'og:image',
      content: 'https://statuslin.es/og/c/my-line.png',
    })
    expect(meta.find((m) => m.property === 'og:title')?.content).toBe(
      'My Line — Claude Code Status Line | statuslin.es',
    )
  })
  it('config shares the search description, or the status line fallback when it has none', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const described = configSocialMeta({ slug: 'a', title: 'A', description: 'Shows  git.' })
    const bare = configSocialMeta({ slug: 'b', title: 'B', description: null })
    const og = (meta: Array<Record<string, string>>) =>
      meta.find((m) => m.property === 'og:description')?.content
    expect(og(described)).toBe('Shows git.')
    expect(og(bare)).toBe(configMetaDescription(null))
  })
  it('root declares the og:image dimensions from the render constants', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const meta = rootSocialMeta()
    expect(meta).toContainEqual({ property: 'og:image:width', content: String(CARD_WIDTH) })
    expect(meta).toContainEqual({ property: 'og:image:height', content: String(CARD_HEIGHT) })
  })
  it('config declares the og:image dimensions from the render constants', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const meta = configSocialMeta({ slug: 'my-line', title: 'My Line', description: 'hi' })
    expect(meta).toContainEqual({ property: 'og:image:width', content: String(CARD_WIDTH) })
    expect(meta).toContainEqual({ property: 'og:image:height', content: String(CARD_HEIGHT) })
  })

  it('static pages reuse the home og image with page-specific title/description/url', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const meta = staticPageSocialMeta({
      path: '/resources',
      title: 'Claude Code Status Line Tools & Resources',
      description: 'A curated list.',
    })
    expect(meta).toContainEqual({
      property: 'og:title',
      content: 'Claude Code Status Line Tools & Resources',
    })
    expect(meta).toContainEqual({ property: 'og:description', content: 'A curated list.' })
    expect(meta).toContainEqual({ property: 'og:url', content: 'https://statuslin.es/resources' })
    expect(meta).toContainEqual({
      property: 'og:image',
      content: 'https://statuslin.es/og/home.png?v=2',
    })
    expect(meta).toContainEqual({
      name: 'twitter:image',
      content: 'https://statuslin.es/og/home.png?v=2',
    })
    expect(meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' })
  })

  it('carries og:type website and the config og:url', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const meta = configSocialMeta({ slug: 'my-config', title: 'My Config', description: 'd' })
    const byProp = (p: string) => meta.find((m) => m.property === p)?.content
    expect(byProp('og:type')).toBe('website')
    expect(byProp('og:url')).toMatch(/\/c\/my-config$/)
  })

  it('mod gives its own url, title and description, with its card on the given origin', () => {
    const base = 'https://staging.statuslin.es'
    const image = `${base}/og/mods/file-tree.png`

    expect(
      modSocialMeta(base, {
        slug: 'file-tree',
        title: 'File Tree',
        description: 'A file tree pane.',
        generatedContent: null,
        themeOnly: false,
        themeCounts: { desktop: 0, terminal: 0 },
      }),
    ).toEqual([
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${base}/mods/file-tree` },
      { property: 'og:title', content: 'File Tree — Claude Code mod | statuslin.es' },
      { property: 'og:description', content: 'A file tree pane.' },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: String(CARD_WIDTH) },
      { property: 'og:image:height', content: String(CARD_HEIGHT) },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: image },
    ])
  })

  it('shares a theme plugin under a themes title and a themes description, never as a mod', () => {
    const meta = modSocialMeta('https://statuslin.es', {
      slug: 'pack',
      title: 'Theme Pack',
      description: '',
      generatedContent: null,
      themeOnly: true,
      themeCounts: { desktop: 0, terminal: 2 },
    })
    const og = (property: string) => meta.find((m) => m.property === property)?.content

    expect(og('og:title')).toBe('Theme Pack — Claude Code Themes | statuslin.es')
    expect(og('og:description')).toBe(
      "Reviewed Claude Code terminal themes. See each theme's preview, then install them with one copied prompt.",
    )
    expect(og('og:image')).toBe('https://statuslin.es/og/mods/pack.png')
  })

  it('shares /themes under its own title and description with the themes card', () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'

    expect(
      themesSocialMeta({
        path: '/themes',
        title: 'Claude Code Themes',
        description: 'Every theme previewed.',
      }),
    ).toEqual([
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://statuslin.es/themes' },
      { property: 'og:title', content: 'Claude Code Themes' },
      { property: 'og:description', content: 'Every theme previewed.' },
      { property: 'og:image', content: 'https://statuslin.es/og/themes.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://statuslin.es/og/themes.png' },
    ])
  })
})
