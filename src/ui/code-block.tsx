import type * as React from 'react'

/**
 * Monospace source block. The default is the detail-page `<pre>`; `compact` is the
 * tighter admin-review variant nested inside a `<details>` (less padding, top margin).
 */
export function CodeBlock({
  compact = false,
  children,
}: {
  compact?: boolean
  children: React.ReactNode
}) {
  const className = compact
    ? 'mt-2 overflow-x-auto rounded-md bg-sunken p-3 font-mono text-foreground text-sm'
    : 'overflow-x-auto rounded-md bg-sunken p-4 font-mono text-foreground text-sm'
  return <pre className={className}>{children}</pre>
}
