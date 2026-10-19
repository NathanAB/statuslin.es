import type { ReactNode } from 'react'
import { Heading } from '@/ui/text'

/**
 * The home hero on a 12-column grid with two left edges: the title over the first eight columns
 * with its one sentence on the last four, then the demo (`stage`) under the title and its controls
 * (`aside`) under the sentence. Below 900px everything stacks.
 */
export function HeroLayout({
  heading,
  lead,
  stage,
  aside,
}: {
  heading: string
  lead: string
  stage: ReactNode
  aside: ReactNode
}) {
  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-[clamp(1.75rem,3.4vw,3rem)]">
      <div className="col-span-12 self-end min-[56.25rem]:col-span-8">
        <Heading level={1} size="display">
          {heading}
        </Heading>
      </div>
      <p className="col-span-12 max-w-[30ch] self-end text-foreground text-lead min-[56.25rem]:col-span-4 min-[56.25rem]:max-w-[22em]">
        {lead}
      </p>
      <div className="col-span-12 min-w-0 min-[56.25rem]:col-span-8">{stage}</div>
      <div className="col-span-12 flex min-w-0 flex-col gap-3.5 min-[56.25rem]:col-span-4">
        {aside}
      </div>
    </div>
  )
}

/** The hero's actions under the picker: the install button, then the link to its page. */
export function HeroActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-5.5 gap-y-3.5 text-body">{children}</div>
  )
}
