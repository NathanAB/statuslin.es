import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Heading } from '@/ui/text'

// The prototype's load sequence: each part rises 28px into place over a second, one after another.
// It's CSS, so it runs from the first paint without waiting for JavaScript. It only moves: nothing
// starts hidden, so the title and the terminal paint at once (they're the page's largest paint).
// Off for a visitor who asks for less motion.
const RISE =
  'motion-safe:animate-in motion-safe:slide-in-from-bottom-7 motion-safe:duration-1000 motion-safe:ease-settle motion-safe:fill-mode-backwards'

/**
 * The home hero on a 12-column grid with two left edges: the title over the first eight columns
 * with its one sentence on the last four, then the demo (`stage`) under the title and its controls
 * (`aside`) under the sentence. Below 900px everything stacks. On load they rise in, in that order.
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
      <div className={cn('col-span-12 self-end min-[56.25rem]:col-span-8', RISE, 'delay-[60ms]')}>
        <Heading level={1} size="display">
          {heading}
        </Heading>
      </div>
      <p
        className={cn(
          'col-span-12 self-end text-foreground text-lead min-[56.25rem]:col-span-4',
          RISE,
          'delay-[240ms]',
        )}
      >
        {lead}
      </p>
      <div className={cn('col-span-12 min-w-0 min-[56.25rem]:col-span-8', RISE, 'delay-[330ms]')}>
        {stage}
      </div>
      <div
        className={cn(
          'col-span-12 flex min-w-0 flex-col gap-3.5 min-[56.25rem]:col-span-4',
          RISE,
          'delay-[420ms]',
        )}
      >
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
