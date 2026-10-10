import type { ReactNode } from 'react'
import type { GalleryModCard } from '@/gallery/gallery-items'
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
    No preview available.
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

/** A card's previews: only what the mod drew, the terminal on top and Claude Desktop cropped below. */
export function ModCardPreview({
  card,
}: {
  card: Pick<GalleryModCard, 'title' | 'preview' | 'desktopShot'>
}) {
  if (card.preview === null && card.desktopShot === null) return <NoPreview />
  return (
    <Stack gap={3}>
      {card.preview !== null && (
        <Labelled surface="terminal">
          <StatuslinePreview segments={card.preview} />
        </Labelled>
      )}
      {card.desktopShot !== null && (
        <Labelled surface="desktop">
          <DesktopShot shot={card.desktopShot} alt={desktopAlt(card.title)} fit="card" />
        </Labelled>
      )}
    </Stack>
  )
}
