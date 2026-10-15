import { afterEach, describe, expect, it } from 'vitest'
import { HOME_TITLE_BASE, homeMetaDescription, homePageName } from '@/lib/page-title'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import {
  configSocialMeta,
  homeSocialMeta,
  modSocialMeta,
  rootSocialMeta,
  staticPageSocialMeta,
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
      content: 'https://statuslin.es/og/home.png',
    })
    expect(meta).toContainEqual({ property: 'og:url', content: 'https://statuslin.es' })
    expect(meta).toContainEqual({ property: 'og:title', content: HOME_TITLE_BASE })
    expect(meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' })
    const description = meta.find((entry) => entry.property === 'og:description')?.content
    expect(description).toMatch(/cop(?:y|ied|ies)/i)
    expect(description).toMatch(/status lines.*\bmods\b/i)
    const pageDescription = meta.find((entry) => entry.name === 'description')?.content
    expect(pageDescription).toMatch(/status lines.*\bmods\b/i)
    expect(description).not.toMatch(/curat|pick|chose|behalf/i)
    expect(description).not.toMatch(/upvote/i)
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
    expect(meta.find((m) => m.property === 'og:title')?.content).toBe('My Line — statuslin.es')
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
      content: 'https://statuslin.es/og/home.png',
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
})
