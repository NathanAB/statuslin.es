import type * as React from 'react'
import { cn } from '@/lib/cn'
import { Copyable } from '@/ui/copy-button'

/**
 * Monospace source block. The default is the detail-page `<pre>`; `compact` is the
 * tighter admin-review variant nested inside a `<details>` (less padding, top margin).
 * `wrap` breaks one long line (an install command) instead of scrolling it under the copy
 * control. Pass `text` to overlay the shared copy control.
 */
export function CodeBlock({
  compact = false,
  wrap = false,
  text,
  copyLabel,
  children,
}: {
  compact?: boolean | undefined
  wrap?: boolean | undefined
  text?: string | undefined
  copyLabel?: string | undefined
  children: React.ReactNode
}) {
  const className = cn(
    compact
      ? 'mt-2 overflow-x-auto rounded-md bg-sunken p-3 font-mono text-foreground text-sm'
      : 'overflow-x-auto rounded-md bg-sunken p-4 font-mono text-foreground text-sm',
    wrap && 'wrap-anywhere whitespace-pre-wrap pr-12',
  )
  return (
    <Copyable text={text} copyLabel={copyLabel}>
      <pre className={className}>{children}</pre>
    </Copyable>
  )
}
