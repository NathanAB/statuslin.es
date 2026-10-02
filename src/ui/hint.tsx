import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'

/**
 * A one-line pointer with a leading icon, in small muted text (wrap emphasis in `Text inline`).
 * `panel` sits on the muted surface, for a note inside a page section. `strip` is an outlined
 * card-colored bar, for a site-wide announcement between page sections.
 */
const VARIANT_CLASS = {
  panel: 'flex items-start gap-2 rounded-md bg-muted p-3 text-muted-foreground text-sm',
  strip:
    'flex items-start gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-muted-foreground text-sm',
} as const

const ICON_CLASS = {
  panel: 'mt-0.5 size-4 shrink-0 text-foreground',
  strip: 'mt-0.5 size-4 shrink-0 text-primary',
} as const

export function Hint({
  icon: Icon,
  variant,
  children,
}: {
  icon: LucideIcon
  variant: 'panel' | 'strip'
  children: React.ReactNode
}) {
  return (
    <div className={VARIANT_CLASS[variant]}>
      <Icon className={ICON_CLASS[variant]} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
