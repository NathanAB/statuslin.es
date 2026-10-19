import { type ReactNode, useId } from 'react'
import { Heading } from '@/ui/text'

/**
 * One section of a public page: its h2 on the page, then its content. Not a box: what's inside (rows, tiles, code) is the one surface, so nothing
 * sits in a box inside a box. The admin pages keep `SectionCard`.
 */
export function PageSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <Heading level={2} id={id}>
        {title}
      </Heading>
      {children}
    </section>
  )
}
