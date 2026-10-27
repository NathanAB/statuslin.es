import type { ReactNode } from 'react'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { TERMINAL_CARD_SURFACE } from '@/lib/card-surface'
import { DesktopShot } from '@/ui/desktop-shot'
import { Stack } from '@/ui/layout'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text } from '@/ui/text'
import { SURFACE_LABEL, type Surface } from './footprint'
import type { ModDetail } from './queries'

const desktopAlt = (title: string) => `${title} in Claude Desktop`

function Labelled({ surface, children }: { surface: Surface; children: ReactNode }) {
  return (
    <Stack gap={1.5}>
      <Text muted size="xs">
        {SURFACE_LABEL[surface]}
      </Text>
      {children}
    </Stack>
  )
}

function DrewNothing({ where }: { where: string }) {
  return (
    <Text muted size="sm">
      Draws nothing {where}.
    </Text>
  )
}

const NoPreview = () => (
  <Text muted size="sm">
    No preview.
  </Text>
)

/** The mod page's previews, the terminal then Claude Desktop. A surface with no result is left out. */
export function ModPreview({ mod }: { mod: Pick<ModDetail, 'title' | 'preview' | 'desktop'> }) {
  const { preview, desktop } = mod
  if (preview === null && desktop === null) return <NoPreview />
  return (
    <Stack gap={4}>
      {preview !== null && (
        <Labelled surface="terminal">
          {preview.length > 0 ? (
            <StatuslinePreview segments={preview} />
          ) : (
            <DrewNothing where="in the terminal" />
          )}
        </Labelled>
      )}
      {desktop !== null && (
        <Labelled surface="desktop">
          {desktop.kind === 'shot' ? (
            <DesktopShot shot={desktop.shot} alt={desktopAlt(mod.title)} fit="whole" />
          ) : (
            <DrewNothing where="in Claude Desktop" />
          )}
        </Labelled>
      )}
    </Stack>
  )
}

/**
 * A gallery row's preview: the surface its card picks, else its Claude Desktop shot, falling back
 * to the other surface when that one has nothing to show.
 */
export function ModRowPreview({
  card,
}: {
  card: Pick<GalleryModCard, 'title' | 'preview' | 'desktopShot' | 'cardSurface'>
}) {
  const desktop =
    card.desktopShot !== null ? (
      <DesktopShot shot={card.desktopShot} alt={desktopAlt(card.title)} fit="card" />
    ) : null
  const terminal =
    card.preview !== null ? <StatuslinePreview segments={card.preview} look="strip" /> : null
  const [first, second] =
    card.cardSurface === TERMINAL_CARD_SURFACE ? [terminal, desktop] : [desktop, terminal]
  return first ?? second ?? <NoPreview />
}
