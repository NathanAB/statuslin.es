import type { LinkProps } from '@tanstack/react-router'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/cn'
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

/**
 * The facts a visitor needs before installing, in one panel beside the install button: who
 * reviewed it, what it can reach, what it needs. Ends with a link to the page that helps next
 * (the troubleshooting guide, the mod safety guide).
 */
export function InstallFacts({
  heading,
  facts,
  link,
}: {
  heading: string
  facts: InstallFact[]
  link: { label: string; to: NonNullable<LinkProps['to']> }
}) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <Panel>
        <Heading level={2} size="compact" id={id}>
          {heading}
        </Heading>
        <ul className="flex flex-col gap-2 text-sm">
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
        {/* Full-strength and underlined: coral text this small on the panel misses 4.5:1. */}
        <TextLink to={link.to} size="sm" tone="underlined">
          {link.label}
          <ArrowRight aria-hidden="true" className="ml-1 inline size-3.5" />
        </TextLink>
      </Panel>
    </section>
  )
}
