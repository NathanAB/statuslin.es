import { cn } from '@/lib/cn'
import { InlineCodeText } from '@/ui/inline-code-text'
import type { InstallFact } from '@/ui/install-facts'

/**
 * A few install facts on one wrapping line, for a tight spot (the home hero, under its install
 * button): each with its icon, a risk in the caution tint. A list named by `label`.
 */
export function FactLine({ label, facts }: { label: string; facts: InstallFact[] }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-small">
      {facts.map(({ icon: Icon, text, caution = false }) => (
        <li
          key={text}
          className={cn(
            'flex items-center gap-1.5',
            caution ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="wrap-anywhere min-w-0">
            <InlineCodeText text={text} tinted={caution} />
          </span>
        </li>
      ))}
    </ul>
  )
}
