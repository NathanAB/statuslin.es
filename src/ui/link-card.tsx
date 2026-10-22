import type { ReactNode } from 'react'
import { Heading, Text } from '@/ui/text'

/**
 * One outside resource as a compact card: its name (usually a StretchedLink, so the whole card
 * opens it), a small note under the name such as where it links, and a short description. The card
 * lifts a tone on hover or when its link has focus. Links in the note sit above the card's own link.
 */
export function LinkCard({
  id,
  title,
  meta,
  description,
}: {
  /** The name's heading id, for links to this card. */
  id?: string
  title: ReactNode
  meta?: ReactNode
  description: string
}) {
  return (
    <div className="relative flex flex-col gap-2 rounded-panel bg-card px-5 pt-4.5 pb-5 transition-colors duration-300 hover:bg-field has-[a:focus-visible]:bg-field">
      <div className="flex flex-col gap-0.5">
        <Heading level={3} size="compact" id={id}>
          {title}
        </Heading>
        {meta ? (
          <div className="w-fit text-muted-foreground text-small [&_a]:relative [&_a]:z-10">
            {meta}
          </div>
        ) : null}
      </div>
      <Text muted size="sm">
        {description}
      </Text>
    </div>
  )
}
