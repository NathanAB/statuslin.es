import { cn } from '@/lib/cn'
import { InlineCodeText } from '@/ui/inline-code-text'
import type { InstallFact } from '@/ui/install-facts'

/**
 * One install fact as a sentence about a named thing, for a tight spot (the home hero, under its
 * install button): its icon, the name, then the fact, a risk in the caution tint. Naming it shows
 * the fact belongs to what's picked and changes with the pick.
 */
export function FactSentence({ subject, fact }: { subject: string; fact: InstallFact }) {
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
        <span className="text-foreground">{subject}</span>{' '}
        <InlineCodeText text={text} tinted={caution} />
      </span>
    </p>
  )
}
