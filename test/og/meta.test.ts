import { afterEach, describe, expect, it } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { configSocialMeta, rootSocialMeta } from '@/og/meta'

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
    expect(meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' })
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
})
