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
  step,
  children,
}: {
  title: string
  id?: string
  /** The section's place in a sequence (/how-it-works's checks), in a circle before its title. */
  step?: number
  children: ReactNode
}) {
  const headingId = useId()
  const heading = (
    <Heading level={2} id={headingId}>
      {title}
    </Heading>
  )
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-4">
      {step === undefined ? (
        heading
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground text-sm tabular-nums">
            {step}
          </span>
          {heading}
        </div>
      )}
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
