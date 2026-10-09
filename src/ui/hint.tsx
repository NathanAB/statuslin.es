import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'

const STRIP = 'rounded-md border border-border bg-card px-4 py-2.5 text-muted-foreground text-sm'

/**
 * A one-line pointer with a leading icon: an outlined, card-colored strip in small muted text
 * (wrap emphasis in `Text inline`). An `action` sits at the strip's end in full-strength text and
 * drops below the message when the row is too narrow for both.
 */
export function Hint({
  icon: Icon,
  action,
  children,
}: {
  icon: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const message = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </>
  )
  if (!action) return <div className={`flex items-start gap-2 ${STRIP}`}>{message}</div>
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${STRIP}`}>
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">{message}</div>
      <div className="shrink-0 text-foreground">{action}</div>
    </div>
  )
}
