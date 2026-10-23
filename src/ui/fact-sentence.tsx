import { cn } from '@/lib/cn'
import { InlineCodeText } from '@/ui/inline-code-text'
import type { InstallFact } from '@/ui/install-facts'

/**
 * One install fact as a short line, for a tight spot (the home hero, under its byline): its icon,
 * then the fact, a risk in the caution tint.
 */
export function FactSentence({ fact }: { fact: InstallFact }) {
  const { icon: Icon, text, caution = false } = fact
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-small',
        caution ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden="true" className="mt-[0.2em] size-3.5 shrink-0" />
      <span className="wrap-anywhere min-w-0">
        <InlineCodeText text={text} tinted={caution} />
      </span>
    </p>
  )
}
