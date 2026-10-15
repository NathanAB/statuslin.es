import type { GalleryModCard } from '@/gallery/gallery-items'
import { MODS_PATH } from '@/lib/site'
import { Row, Stack } from '@/ui/layout'
import { Heading, TextLink } from '@/ui/text'
import { getGalleryModsFn } from './gallery-functions'
import { ModCard } from './mod-card'
import { NEW_MOD_CANDIDATES } from './new-mods'

const HEADING_ID = 'new-mods-heading'

/** The row's candidates: the newest published mods, newest first. selectNewMods picks from them. */
export async function loadNewMods(): Promise<GalleryModCard[]> {
  const { items } = await getGalleryModsFn({ data: { sort: 'new', limit: NEW_MOD_CANDIDATES } })
  return items.flatMap(({ item }) => (item.kind === 'mod' ? [item.card] : []))
}

/**
 * The home page's pinned row of the newest mods, above the ranked gallery. New mods have no
 * installs yet, so the trending sort would leave them pages deep. Nothing without any.
 */
export function NewModsRow({ mods }: { mods: GalleryModCard[] }) {
  if (mods.length === 0) return null
  return (
    <section aria-labelledby={HEADING_ID}>
      <Stack gap={4}>
        <Row gap={4} justify="between" wrap>
          <Heading level={2} id={HEADING_ID}>
            New mods
          </Heading>
          <TextLink to={MODS_PATH}>Browse all mods</TextLink>
        </Row>
        <Stack gap={4}>
          {mods.map((card, index) => (
            <ModCard
              key={card.slug}
              card={card}
              analytics={{ surface: 'home_new_mods', position: index + 1 }}
            />
          ))}
        </Stack>
      </Stack>
    </section>
  )
}
