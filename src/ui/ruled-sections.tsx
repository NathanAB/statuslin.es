import type { ReactNode } from 'react'

/**
 * A long page's parts, one under another, each after the first set off by a hairline rule with
 * room on both sides, so where one section ends and the next begins reads at a glance. The status
 * line and mod pages: their header, then each section.
 */
export function RuledSections({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="ruled-sections"
      className="flex flex-col gap-8 max-md:gap-6 [&>*+*]:border-border [&>*+*]:border-t [&>*+*]:pt-8 max-md:[&>*+*]:pt-6"
    >
      {children}
    </div>
  )
}
