import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { PAGE_COLUMN } from '@/ui/page-column'

/**
 * One section of the home page, on the page column. The first sits just under the header; every
 * other one keeps the section gap from the one above. `band` sets it on a full-width band of
 * darker colour, so it reads apart from the gallery above it.
 */
export function HomeSection({
  id,
  labelledBy,
  first = false,
  band = false,
  children,
}: {
  id?: string
  /** The id of the section's heading, which names it as a region. */
  labelledBy?: string
  first?: boolean
  band?: boolean
  children: ReactNode
}) {
  if (band)
    return (
      <section
        id={id}
        aria-labelledby={labelledBy}
        className="mt-section bg-sunken py-[clamp(3.5rem,7vw,6rem)]"
      >
        <div className={PAGE_COLUMN}>{children}</div>
      </section>
    )
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(PAGE_COLUMN, first ? 'pt-[clamp(1.75rem,4vw,3.5rem)]' : 'mt-section')}
    >
      {children}
    </section>
  )
}
