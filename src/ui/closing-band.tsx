import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { PAGE_COLUMN } from '@/ui/page-column'
import { Reveal } from '@/ui/reveal'

/**
 * The home page's closing section: a full-width coral band, nearly a screen tall, with a big
 * heading and one sentence on the left and a panel (the submit choice) on the right. Light text
 * on the deeper coral fill, which keeps it at WCAG AA.
 */
export function ClosingBand({
  heading,
  lead,
  panel,
}: {
  heading: string
  lead: string
  panel: ReactNode
}) {
  return (
    <section className="mt-section bg-primary-fill text-primary-foreground">
      <div
        className={cn(
          'grid min-h-[88svh] grid-cols-12 content-between items-center gap-x-6 gap-y-12 py-[clamp(3.5rem,7vw,6rem)] min-[56.25rem]:content-center',
          PAGE_COLUMN,
        )}
      >
        <div className="col-span-12 self-start min-[56.25rem]:col-span-5 min-[56.25rem]:self-end">
          <Reveal>
            <h2 className="mb-5.5 font-semibold text-display leading-[0.92] tracking-[-0.045em]">
              {heading}
            </h2>
          </Reveal>
          <Reveal>
            <p className="text-body">{lead}</p>
          </Reveal>
        </div>
        <div className="col-span-12 min-[56.25rem]:col-span-5 min-[56.25rem]:col-start-7">
          <Reveal>{panel}</Reveal>
        </div>
      </div>
    </section>
  )
}
