import { type ReactNode, useId } from 'react'
import { Heading } from '@/ui/text'

/**
 * One section of a public page: its h2 on the page, then its content. Not a box: what's inside (rows, tiles, code) is the one surface, so nothing
 * sits in a box inside a box. The admin pages keep `SectionCard`. `id` is the anchor a link like
 * /guide#its-id lands on; the base styles stop the scroll a little above it.
 */
export function PageSection({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-4">
      <Heading level={2} id={headingId}>
        {title}
      </Heading>
      {children}
    </section>
  )
}

/**
 * The anchor for a section that isn't a `PageSection`: an h3 subsection, or one whose heading
 * another component draws (the guide's FAQ). A link lands on it the way it lands on a `PageSection`.
 */
export function SectionAnchor({ id, children }: { id: string; children: ReactNode }) {
  return <section id={id}>{children}</section>
}
