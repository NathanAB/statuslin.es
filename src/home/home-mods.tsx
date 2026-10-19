import { usePostHog } from '@posthog/react'
import { cardClickProperties, type GalleryCardAnalytics } from '@/gallery/card-analytics'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { MOD_ROUTE, MODS_PATH } from '@/lib/site'
import { installsLabel } from '@/ui/install-count'
import { type CarouselItem, ShotCarousel } from '@/ui/shot-carousel'
import { TextLink } from '@/ui/text'

/** How many shots the row shows, the featured mod's included. */
const MODS_ROW_SIZE = 7

/**
 * The home page's mods: a row of their Claude Desktop shots, the featured mod first, then the
 * others the loader picked. A mod with no Desktop shot has nothing to show here, so it is left
 * out; with none at all the band is too. `total` counts every published mod for "All N mods".
 */
export function HomeMods({
  featured,
  others,
  total,
}: {
  featured: GalleryModCard | null
  others: GalleryModCard[]
  total: number
}) {
  const posthog = usePostHog()
  const shown = [...(featured ? [featured] : []), ...others]
    .filter((mod) => mod.desktopShot)
    .slice(0, MODS_ROW_SIZE)

  const items = shown.flatMap((mod, index): CarouselItem[] => {
    if (!mod.desktopShot) return []
    // The featured mod keeps the surface the old "Featured mod" row reported.
    const analytics: GalleryCardAnalytics = {
      surface: mod === featured ? 'home_featured_mod' : 'home_mods_row',
      position: index + 1,
    }
    return [
      {
        key: mod.slug,
        to: MOD_ROUTE,
        params: { slug: mod.slug },
        onOpen: () =>
          posthog.capture(
            'mod_card_clicked',
            cardClickProperties({ modId: mod.modId, slug: mod.slug }, analytics),
          ),
        title: mod.title,
        description: mod.description,
        byline: `@${mod.authorGithub} · ${installsLabel(mod.copyCount)}`,
        shot: mod.desktopShot,
        alt: `${mod.title} running in Claude Desktop`,
      },
    ]
  })
  if (items.length === 0) return null

  return (
    <ShotCarousel
      heading="Mods"
      lead="Plugins that change more than the line: the prompt, the transcript, Claude Desktop."
      listLabel="Mods in Claude Desktop"
      items={items}
      more={
        <TextLink to={MODS_PATH} tone="underlined">
          All {total} mods
        </TextLink>
      }
    />
  )
}
