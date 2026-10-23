import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { PAGE_COLUMN } from '@/ui/page-column'
import { Heading } from '@/ui/text'

/**
 * One section of a directory page (/resources), on the page column: its title, a short intro under
 * it, then its entries. Closer together than the home page's sections, since a reader scans these
 * one after another.
 */
export function DirectorySection({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cn(PAGE_COLUMN, 'mt-[clamp(3.5rem,7vw,6rem)] flex flex-col gap-6')}>
      <div className="flex flex-col gap-2.5">
        <Heading level={2} size="subsection">
          {title}
        </Heading>
        {intro}
      </div>
      {children}
    </section>
  )
}
