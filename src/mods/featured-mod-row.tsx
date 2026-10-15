import type { GalleryModCard } from '@/gallery/gallery-items'
import { Row, Stack } from '@/ui/layout'
import { Heading, TextLink } from '@/ui/text'
import { ModCard } from './mod-card'

/** The id of the home page's gallery, which the row's link scrolls to. */
export const GALLERY_ID = 'gallery'

const HEADING_ID = 'featured-mod-heading'

/**
 * The home page's pinned "Featured mod" row, above the ranked gallery. Its link switches the
 * gallery's filter to mods and scrolls down to it, since the filter sits right below it. Nothing without a mod.
 */
export function FeaturedModRow({ mod }: { mod: GalleryModCard | null }) {
  if (!mod) return null
  return (
    <section aria-labelledby={HEADING_ID}>
      <Stack gap={4}>
        <Row gap={4} justify="between" wrap>
          <Heading level={2} id={HEADING_ID}>
            Featured mod
          </Heading>
          <TextLink to="/" search={{ kind: 'mods' }} hash={GALLERY_ID}>
            Browse all mods
          </TextLink>
        </Row>
        <ModCard card={mod} analytics={{ surface: 'home_featured_mod', position: 1 }} />
      </Stack>
    </section>
  )
}
