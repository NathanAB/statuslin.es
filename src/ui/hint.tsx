import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'

/**
 * A one-line pointer with a leading icon: an outlined, card-colored strip in small muted text
 * (wrap emphasis in `Text inline`).
 */
export function Hint({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-muted-foreground text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
