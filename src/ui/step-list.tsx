import type { ReactNode } from 'react'
import { Heading } from '@/ui/text'

export interface Step {
  /** The anchor a link lands on, like /guide#make-it-runnable. */
  id: string
  title: string
  content: ReactNode
}

/**
 * Steps a person follows in order (the guide's "Wire up a script by hand"): each one a number and
 * an h3, then its text and code under it at the column's full width. Not a box: the code wells
 * inside are the only surface. The number is real text, so it is read out with the title.
 */
export function StepList({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-9">
      {steps.map((step, i) => (
        <li key={step.id}>
          {/* A section with an id: the base styles stop a link's scroll a little above it. */}
          <section id={step.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground text-sm tabular-nums">
                {i + 1}
              </span>
              <Heading level={3}>{step.title}</Heading>
            </div>
            {step.content}
          </section>
        </li>
      ))}
    </ol>
  )
}
