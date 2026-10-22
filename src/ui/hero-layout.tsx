import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Heading } from '@/ui/text'

// The prototype's load sequence: each part fades in as it rises 28px into place over a second, one
// after another. It's CSS, so it runs from the first paint without waiting for JavaScript. Every
// part fades: one sliding up without a fade, beside the others fading in, read as nonsensical.
// Off for a visitor who asks for less motion, so the page shows at once.
const RISE =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-7 motion-safe:duration-1000 motion-safe:ease-settle motion-safe:fill-mode-backwards'

/**
 * The home hero on a 12-column grid: the title across the full width with its sentences right under
 * it, a line each, then the demo (`stage`) under them and its controls (`picker`, then `actions`) in
 * the last four columns beside it. Below 900px everything stacks, with the actions moved above the
 * picker so a phone's first screen holds the install button. On load they rise in, in that order.
 */
export function HeroLayout({
  heading,
  lead,
  stage,
  picker,
  actions,
}: {
  heading: ReactNode
  /** The sentences under the title, each on a line of its own where it fits. */
  lead: readonly string[]
  stage: ReactNode
  picker: ReactNode
  /** The install button and what to know about it. Under the picker on wide screens; on phones
   *  right under the demo, so the first screen holds the button. */
  actions: ReactNode
}) {
  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-[clamp(1.75rem,3.4vw,3rem)]">
      <div className="col-span-12 grid grid-cols-12 gap-x-6 gap-y-[clamp(0.875rem,1.6vw,1.375rem)]">
        <div className={cn('col-span-12', RISE, 'delay-[60ms]')}>
          <Heading level={1} size="display">
            {heading}
          </Heading>
        </div>
        <p
          className={cn('col-span-12 text-pretty text-foreground text-lead', RISE, 'delay-[240ms]')}
        >
          {lead.map((line, i) => (
            <Fragment key={line}>
              {i > 0 ? ' ' : null}
              <span className="block">{line}</span>
            </Fragment>
          ))}
        </p>
      </div>
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
        <div className="order-2 flex min-w-0 flex-col gap-3.5 min-[56.25rem]:order-1">{picker}</div>
        <div className="order-1 flex min-w-0 flex-col gap-3.5 min-[56.25rem]:order-2">
          {actions}
        </div>
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
