import { siteUrl } from '@/lib/site'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/render'

export function rootSocialMeta(): Array<Record<string, string>> {
  const base = siteUrl()
  return [
    {
      name: 'description',
      content:
        'A community gallery of Claude Code status lines — browse rendered previews, upvote, and copy one to use.',
    },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: base },
    { property: 'og:title', content: 'statuslin.es' },
    { property: 'og:description', content: 'A community gallery of Claude Code status lines.' },
    { property: 'og:image', content: `${base}/og/home.png` },
    { property: 'og:image:width', content: String(CARD_WIDTH) },
    { property: 'og:image:height', content: String(CARD_HEIGHT) },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: `${base}/og/home.png` },
  ]
}

export function configSocialMeta(input: {
  slug: string
  title: string
  description: string | null
}): Array<Record<string, string>> {
  const base = siteUrl()
  const image = `${base}/og/c/${input.slug}.png`
  return [
    { property: 'og:title', content: `${input.title} — statuslin.es` },
    {
      property: 'og:description',
      content: input.description || 'A reviewed Claude Code status line.',
    },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: String(CARD_WIDTH) },
    { property: 'og:image:height', content: String(CARD_HEIGHT) },
    { name: 'twitter:image', content: image },
  ]
}
