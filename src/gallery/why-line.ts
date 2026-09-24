import { FACETS, tagLabel } from '@/gallery/facets'
import type { GalleryCard } from '@/gallery/queries'

const STYLE_TAGS = new Set(['minimal', 'multi-line', 'powerline', 'themed'])

const SHOWN = FACETS.filter((f) => f.group === 'feature' && !STYLE_TAGS.has(f.slug))
const STYLES = FACETS.filter((f) => STYLE_TAGS.has(f.slug))

export function listPhrase(items: string[], conjunction = 'and'): string {
  if (items.length <= 2) return items.join(` ${conjunction} `)
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items.at(-1)}`
}

function styleWord(slug: string, chipLabel: string): string {
  return slug === 'powerline' ? 'powerline-style' : chipLabel
}

export function whyLine(card: Pick<GalleryCard, 'tags' | 'interpreter' | 'networkHosts'>): string {
  const shown = SHOWN.filter((f) => card.tags.includes(f.slug)).map((f) => f.chipLabel)
  const styles = STYLES.filter((f) => card.tags.includes(f.slug)).map((f) =>
    styleWord(f.slug, f.chipLabel),
  )
  const shape = [styles.join(', '), `${tagLabel(card.interpreter)} script.`].filter(Boolean)
  const sentences = [
    shown.length > 0 ? `Shows ${listPhrase(shown)}.` : '',
    upperFirst(shape.join(' ')),
    card.networkHosts.length > 0 ? 'Needs network access.' : '',
  ]
  return sentences.filter(Boolean).join(' ')
}

export interface RankedCard {
  card: GalleryCard
  why: string
}

export function rankedCard(card: GalleryCard): RankedCard {
  return { card, why: whyLine(card) }
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
