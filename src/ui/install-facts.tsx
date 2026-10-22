import type { LinkProps } from '@tanstack/react-router'
import { ArrowRight, ChevronRight, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { FOCUS_RING } from '@/ui/focus-ring'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Panel } from '@/ui/panel'
import { Heading, TextLink } from '@/ui/text'

export interface InstallFact {
  icon: LucideIcon
  /** One short line. Backticks mark code: "Needs `jq`". */
  text: string
  /** A risk the visitor takes on, drawn in the warning tint. */
  caution?: boolean
}

/** Facts that can wait, closed under a one-line summary ("9 more things it can do"). */
export interface FoldedFacts {
  summary: string
  facts: InstallFact[]
}

function FactList({ facts, folded = false }: { facts: InstallFact[]; folded?: boolean }) {
  return (
    <ul className={cn('flex flex-col gap-2 text-sm', folded && 'mt-2')}>
      {facts.map(({ icon: Icon, text, caution = false }) => (
        <li
          key={text}
          data-tone={caution ? 'caution' : 'plain'}
          className={cn('flex gap-2.5', caution ? 'text-warning' : 'text-foreground')}
        >
          <Icon
            aria-hidden="true"
            className={cn('mt-0.5 size-4 shrink-0', !caution && 'text-muted-foreground')}
          />
          <span className="wrap-anywhere min-w-0">
            <InlineCodeText text={text} tinted={caution} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A native disclosure, so it opens without JavaScript and from the keyboard. */
function Fold({ summary, facts }: FoldedFacts) {
  return (
    <details className="group text-sm">
      <summary
        className={cn(
          'flex cursor-pointer gap-2.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden',
          FOCUS_RING,
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {summary}
      </summary>
      <FactList facts={facts} folded />
    </details>
  )
}

/**
 * The facts a visitor needs before installing, in one panel beside the install button: who
 * reviewed it, what it can reach, what it needs. `more` and `notes` (a mod's plain powers and its
 * good-to-know notes) fold under their summaries, closed, so the risks above them stand out. Ends
 * with a link to the page that helps next (the troubleshooting guide, the mod safety guide).
 */
export function InstallFacts({
  heading,
  facts,
  more,
  notes,
  link,
}: {
  heading: string
  facts: InstallFact[]
  more?: FoldedFacts | null
  notes?: FoldedFacts | null
  link: { label: string; to: NonNullable<LinkProps['to']> }
}) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <Panel>
        <Heading level={2} size="compact" id={id}>
          {heading}
        </Heading>
        <FactList facts={facts} />
        {more ? <Fold {...more} /> : null}
        {notes ? <Fold {...notes} /> : null}
        {/* Full-strength and underlined: coral text this small on the panel misses 4.5:1. */}
        <TextLink to={link.to} size="sm" tone="underlined">
          {link.label}
          <ArrowRight aria-hidden="true" className="ml-1 inline size-3.5" />
        </TextLink>
      </Panel>
    </section>
  )
}
